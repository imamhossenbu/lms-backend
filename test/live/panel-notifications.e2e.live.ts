/**
 * Browser E2E for the admin panel Notifications against the real API: inbox from the API (no mock items) with the
 * navbar bell count, mark as read + archive, compose → recipient estimate → Send Now (deliveries only to this
 * workspace's students), the Broadcasts tab kept across reloads, broadcast detail, Save as Draft, template on/off
 * and workspace isolation. Panel on :3010, API on :4077 by default. Cleanup in `finally`.
 */
import { PANEL, SHOTS, check, cleanup, dumpPages, fill, launch, login, mkInstitution, mkUser, newTag, prisma as p, realClick, report, result, sleep, text, until, waitForText, type Ids } from "./panel-e2e-helpers";
import type { Page } from "puppeteer-core";

const tag = newTag();

/** Clicks the button with aria-label `label` inside the inbox row that shows `title`. */
async function rowAction(page: Page, title: string, label: string) {
  const ok = await page.evaluate(
    (t, l) => {
      // Start at the row's own checkbox and climb to the nearest ancestor that holds the action button.
      let el: HTMLElement | null = document.querySelector<HTMLElement>(`[aria-label="Select \\"${t}\\""]`);
      let hit: HTMLButtonElement | null = null;
      for (let i = 0; i < 10 && el && !hit; i++, el = el.parentElement) hit = el.querySelector<HTMLButtonElement>(`button[aria-label="${l}"]`);
      document.querySelectorAll("[data-e2e]").forEach((e) => e.removeAttribute("data-e2e"));
      hit?.setAttribute("data-e2e", "row-action");
      return !!hit;
    },
    title,
    label,
  );
  if (!ok) throw new Error(`No "${label}" for "${title}"`);
  await page.click('[data-e2e="row-action"]');
}

(async () => {
  const ids: Ids = { users: [], insts: [] };
  const browser = await launch();
  try {
    const inst = await mkInstitution(ids, tag);
    const other = await mkInstitution(ids, `${tag}-other`);
    const admin = await mkUser(ids, tag, "Notif Admin", "ADMIN", inst.id);
    const s1 = await mkUser(ids, tag, "Notif Student One", "STUDENT", inst.id);
    const s2 = await mkUser(ids, tag, "Notif Student Two", "STUDENT", inst.id);
    const otherAdmin = await mkUser(ids, tag, "Other Admin", "ADMIN", other.id);
    const otherStudent = await mkUser(ids, tag, "Other Student", "STUDENT", other.id);
    const mkNote = (userId: string, institutionId: string, title: string) =>
      p.notification.create({ data: { userId, institutionId, title, message: `Message for ${title}`, type: "SYSTEM", category: "SYSTEM" } });
    const n1 = await mkNote(admin.id, inst.id, `Inbox One ${tag}`);
    const n2 = await mkNote(admin.id, inst.id, `Inbox Two ${tag}`);
    await mkNote(otherAdmin.id, other.id, `Foreign Note ${tag}`);
    const foreignBroadcast = await p.announcement.create({
      data: { courseId: "", createdBy: otherAdmin.id, title: `Foreign Broadcast ${tag}`, message: "x", messageHtml: "<p>x</p>", targetRole: "STUDENT", institutionId: other.id, audience: "ALL_STUDENTS", status: "SENT", sendAt: new Date(), recipientCount: 1 },
    });

    const { ctx, page } = await login(browser, admin.email);

    // Every API list call the page makes (server-side paging check).
    const apiCalls: string[] = [];
    page.on("request", (r) => r.url().includes("/admin/") && apiCalls.push(r.url()));
    const pagedCall = (path: string) => apiCalls.some((u) => { const url = new URL(u); return url.pathname.endsWith(path) && url.searchParams.has("page") && Number(url.searchParams.get("limit")) <= 20; });
    // ---------------------------------------------------------------- 1. inbox + bell
    await page.goto(`${PANEL}/notifications`, { waitUntil: "networkidle2" });
    await waitForText(page, `Inbox One ${tag}`);
    const t0 = await text(page);
    check("inbox loads from the API", t0.includes(`Inbox Two ${tag}`) && !t0.includes(`Foreign Note ${tag}`), t0.slice(0, 300));
    check("inbox and bell ask the API for pages + counters (no full inbox)", pagedCall("/admin/notifications/inbox") && apiCalls.some((u) => u.includes("/inbox/stats")) && !apiCalls.some((u) => /\/inbox\?.*limit=100/.test(u)), apiCalls.filter((u) => u.includes("/inbox")).slice(0, 4));
    const bell = await until(() => page.$$eval("button[aria-label^='Notifications']", (bs) => bs.map((b) => b.getAttribute("aria-label")).join("|")), (v) => v.includes("2 unread"));
    check("navbar bell shows the unread count", bell.includes("2 unread"), bell);
    await page.screenshot({ path: `${SHOTS}/notif-1-inbox.png` });

    // ---------------------------------------------------------------- 2. mark as read + archive
    await rowAction(page, `Inbox One ${tag}`, "Mark as read");
    const r1 = await until(() => p.notification.findUnique({ where: { id: n1.id } }), (n: any) => n?.isRead === true);
    check("mark as read saved via the API", r1?.isRead === true && !!r1?.readAt, r1 && { isRead: r1.isRead, readAt: r1.readAt });
    const bell2 = await until(() => page.$$eval("button[aria-label^='Notifications']", (bs) => bs.map((b) => b.getAttribute("aria-label")).join("|")), (v) => v.includes("1 unread"));
    check("bell count follows", bell2.includes("1 unread"), bell2);
    await rowAction(page, `Inbox Two ${tag}`, "Archive");
    const r2 = await until(() => p.notification.findUnique({ where: { id: n2.id } }), (n: any) => n?.isArchived === true);
    check("archive saved via the API", r2?.isArchived === true);

    // ---------------------------------------------------------------- 3. compose + send now
    await page.goto(`${PANEL}/notifications/compose`, { waitUntil: "networkidle2" });
    await page.waitForSelector("#broadcast-title", { timeout: 30000 });
    const title = `Broadcast ${tag}`;
    await fill(page, "#broadcast-title", title);
    await page.click("#broadcast-message .ProseMirror, #broadcast-message [contenteditable='true']");
    await page.keyboard.type("Hello students from the browser test");
    await sleep(500);
    await waitForText(page, "2 students").catch(() => undefined);
    const estimate = await text(page);
    check("recipient estimate comes from the API (this workspace's 2 students)", /\b2 students\b/.test(estimate) || estimate.includes("≈ 2"), estimate.match(/.{0,30}students.{0,10}/g)?.slice(0, 4));
    await realClick(page, 'button[type="submit"]', "Send Now");
    await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
    const dlg = await page.$eval('[role="dialog"]', (d) => (d as HTMLElement).innerText);
    check("confirm modal shows the API estimate", dlg.includes("≈ 2"), dlg.slice(0, 200));
    await realClick(page, '[role="dialog"] button', "Send Now");
    const sent = await until(() => p.announcement.findFirst({ where: { institutionId: inst.id, title } }), (a: any) => a?.status === "SENT");
    check("broadcast sent via the API", sent?.status === "SENT" && sent?.audience === "ALL_STUDENTS", sent && { s: sent.status, a: sent.audience });
    const delivered = await until(() => p.notification.findMany({ where: { broadcastId: sent?.id ?? "-" } }), (r: any[]) => r.length >= 2);
    const to = new Set(delivered.map((n: any) => n.userId));
    check("delivered only to this workspace's students", to.has(s1.id) && to.has(s2.id) && !to.has(otherStudent.id), [...to]);
    await waitForText(page, "Broadcast sent");

    // ---------------------------------------------------------------- 4. broadcasts tab + detail
    await page.goto(`${PANEL}/notifications?tab=broadcasts`, { waitUntil: "networkidle2" });
    await waitForText(page, title);
    await page.reload({ waitUntil: "networkidle2" });
    await waitForText(page, title);
    const t4 = await text(page);
    check("broadcast list asks the API for one page (page + limit)", pagedCall("/admin/notifications/broadcasts"), apiCalls.filter((u) => u.includes("/broadcasts")).slice(0, 3));
    check("?tab=broadcasts stays open after a reload and lists the broadcast", new URL(page.url()).searchParams.get("tab") === "broadcasts" && !t4.includes(`Foreign Broadcast ${tag}`));
    await page.goto(`${PANEL}/notifications/broadcasts/${sent.id}`, { waitUntil: "networkidle2" });
    await waitForText(page, title);
    const t4b = await text(page);
    check("broadcast detail shows the API numbers", t4b.includes("Notif Student One") || /\b2\b/.test(t4b), t4b.slice(0, 300));
    await page.screenshot({ path: `${SHOTS}/notif-2-detail.png` });

    // ---------------------------------------------------------------- 5. save as draft
    await page.goto(`${PANEL}/notifications/compose`, { waitUntil: "networkidle2" });
    await page.waitForSelector("#broadcast-title");
    await fill(page, "#broadcast-title", `Draft ${tag}`);
    await page.click("#broadcast-message .ProseMirror, #broadcast-message [contenteditable='true']");
    await page.keyboard.type("Draft body");
    await sleep(300);
    await realClick(page, "button", "Save as Draft");
    const draft = await until(() => p.announcement.findFirst({ where: { institutionId: inst.id, title: `Draft ${tag}` } }), (a: any) => !!a);
    check("draft saved via the API without deliveries", draft?.status === "DRAFT" && (await p.notification.count({ where: { broadcastId: draft?.id ?? "-" } })) === 0, draft?.status);

    // ---------------------------------------------------------------- 6. templates on / off
    await page.goto(`${PANEL}/notifications?tab=templates`, { waitUntil: "networkidle2" });
    await page.waitForSelector('[role="switch"][aria-checked="true"]:not([disabled])', { timeout: 30000 });
    const offBefore = await p.notificationTemplate.count({ where: { institutionId: inst.id, enabled: false } });
    await page.click('[role="switch"][aria-checked="true"]:not([disabled])');
    await waitForText(page, "Template disabled");
    const offAfter = await until(() => p.notificationTemplate.count({ where: { institutionId: inst.id, enabled: false } }), (n: number) => n === offBefore + 1);
    check("template turned off via the API", offAfter === offBefore + 1, { offBefore, offAfter });
    const otherOff = await p.notificationTemplate.count({ where: { institutionId: other.id, enabled: false } });
    check("another workspace's templates are untouched", otherOff === 0);

    // ---------------------------------------------------------------- 7. isolation
    await page.goto(`${PANEL}/notifications/broadcasts/${foreignBroadcast.id}`, { waitUntil: "networkidle2" });
    await sleep(2000);
    check("another workspace's broadcast can't be opened", !(await text(page)).includes(`Foreign Broadcast ${tag}`));
    await ctx.close();
  } catch (e) {
    console.log("FAIL exception", (e as Error).message || String(e).slice(0, 400));
    result.bad++;
    await dumpPages(browser, "notif");
  } finally {
    await browser.close();
    await cleanup(ids, tag, async () => {
      const bs = (await p.announcement.findMany({ where: { institutionId: { in: ids.insts } }, select: { id: true } })).map((b: any) => b.id);
      await p.notification.deleteMany({ where: { broadcastId: { in: bs } } });
      await p.notificationDelivery.deleteMany({ where: { broadcastId: { in: bs } } });
      await p.announcement.deleteMany({ where: { id: { in: bs } } });
      await p.notificationTemplate.deleteMany({ where: { institutionId: { in: ids.insts } } });
    });
    await report(tag, `, (select count(*)::int from "Announcement" where title like '%${tag}%') broadcasts, (select count(*)::int from "NotificationTemplate" where "institutionId" in (${ids.insts.map((i) => `'${i}'`).join(",") || "''"})) templates`);
  }
})();
