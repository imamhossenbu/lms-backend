/**
 * Browser E2E for the admin panel Certificates against the real API: list from the API (no mock data), the template
 * designer on a real course (course chips from the API), the eligible queue + "Issue to all", manual issue with the
 * learner picker (learners from the API), detail page, revoke + restore, the verify modal, and workspace isolation.
 * Panel on :3010, API on :4077 by default. Cleanup in `finally`.
 */
import "dotenv/config";
import * as bcrypt from "bcrypt";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { PrismaService } from "../../src/prisma/prisma.service";

const PANEL = process.env.LIVE_PANEL_URL ?? "http://localhost:3010";
const SHOTS = process.env.LIVE_SHOTS_DIR ?? require("os").tmpdir();
const p: any = new PrismaService();
const tag = `e2ecrt${Date.now().toString(36)}`;
let ok = 0, bad = 0;
const check = (name: string, cond: boolean, extra?: unknown) => {
  cond ? ok++ : bad++;
  console.log(cond ? "PASS" : "FAIL", name, cond ? "" : JSON.stringify(extra)?.slice(0, 300));
};
const text = (page: Page) => page.evaluate(() => document.body.innerText);
const waitForText = (page: Page, needle: string, timeout = 30000) => page.waitForFunction((n) => document.body.innerText.includes(n), { timeout }, needle);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until<T>(fn: () => Promise<T>, okFn: (v: T) => boolean, tries = 30) {
  let v = await fn();
  for (let i = 0; i < tries && !okFn(v); i++) {
    await sleep(400);
    v = await fn();
  }
  return v;
}
async function fill(page: Page, selector: string, value: string) {
  await page.waitForSelector(selector);
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.press("Backspace");
  if (value) await page.type(selector, value);
}
async function realClick(page: Page, selector: string, label: string, exact = false) {
  const handle = await page.evaluateHandle(
    (sel, l, ex) =>
      [...document.querySelectorAll<HTMLElement>(sel)].reverse().find((e) => (ex ? e.innerText.trim() === l : e.innerText.trim().includes(l)) && e.offsetParent !== null && !(e as HTMLButtonElement).disabled) ?? null,
    selector,
    label,
    exact,
  );
  const el = handle.asElement();
  if (!el) throw new Error(`No "${label}" in ${selector}`);
  await (el as any).click();
}
async function pick(page: Page, placeholder: string, option: string) {
  await realClick(page, 'button[role="combobox"]', placeholder);
  await page.waitForSelector('[role="option"]', { timeout: 10000 });
  await realClick(page, '[role="option"]', option);
  await sleep(400);
}

(async () => {
  const ids = { users: [] as string[], insts: [] as string[] };
  const browser: Browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-first-run"] });
  try {
    const mkInst = async (slug: string) => {
      const i = await p.institution.create({ data: { name: `E2E ${slug}`, slug, logoInitials: "EE", type: "SCHOOL", country: "Bangladesh", ownerName: "E2E", ownerEmail: `${slug}@example.com`, planId: "pro", status: "ACTIVE", currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 864e5) } });
      ids.insts.push(i.id);
      return i;
    };
    const inst = await mkInst(tag);
    const other = await mkInst(`${tag}-other`);
    const mkUser = async (n: string, role: string, institutionId: string) => {
      const u = await p.user.create({ data: { name: n, email: `${tag}-${n.toLowerCase().replace(/\s+/g, "-")}@example.com`, password: await bcrypt.hash("Admin12345", 10), role, status: "ACTIVE", emailVerified: true, institutionId } });
      ids.users.push(u.id);
      return u;
    };
    const admin = await mkUser("Cert Admin", "ADMIN", inst.id);
    const done = await mkUser(`Done Learner ${tag}`, "STUDENT", inst.id);
    const manual = await mkUser(`Manual Learner ${tag}`, "STUDENT", inst.id);
    const otherAdmin = await mkUser("Other Admin", "ADMIN", other.id);
    const otherStudent = await mkUser(`Other Learner ${tag}`, "STUDENT", other.id);
    const mkCourse = async (institutionId: string, title: string, instructorId: string) => {
      const cat = await p.category.create({ data: { name: `Cat ${title}`, slug: `cat-${title.toLowerCase().replace(/\s+/g, "-")}`, status: "ACTIVE", institutionId } });
      return p.course.create({ data: { title, slug: title.toLowerCase().replace(/\s+/g, "-"), description: "d", shortDescription: "s", categoryId: cat.id, instructorId, level: "Beginner", language: "English", price: 0, isFree: true, status: "PUBLISHED", durationMinutes: 60, institutionId } });
    };
    const course = await mkCourse(inst.id, `Cert Course ${tag}`, admin.id);
    const otherCourse = await mkCourse(other.id, `Other Course ${tag}`, otherAdmin.id);
    const doneAt = new Date(Date.now() - 2 * 864e5);
    await p.enrollment.create({ data: { userId: done.id, courseId: course.id, status: "ACTIVE", progressPercentage: 100, completedAt: doneAt } });
    await p.enrollment.create({ data: { userId: manual.id, courseId: course.id, status: "ACTIVE", progressPercentage: 40 } });

    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    page.on("dialog", (d) => void d.accept());
    await page.goto(`${PANEL}/login`, { waitUntil: "networkidle2" });
    await fill(page, "#email-address", admin.email);
    await fill(page, "#password-field", "Admin12345");
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => location.pathname === "/", { timeout: 25000 });
    const listRequests: string[] = [];
    page.on("request", (r) => listRequests.push(r.url()));

    // ---------------------------------------------------------------- 1. list (empty workspace, no mock data)
    await page.goto(`${PANEL}/certificates`, { waitUntil: "networkidle2" });
    await waitForText(page, "Verify Certificate");
    await sleep(1200);
    const t0 = await text(page);
    check("certificates list loads from the API (no mock certificates / courses)", !t0.includes("HTML Fundamentals") && !t0.includes("EDU-HF-") && !t0.includes("Sarah Rahman"), t0.slice(0, 300));
    {
      const pageReqs = listRequests.filter((u) => /\/admin\/certificates\?/.test(u) && !/\/(stats|activity|eligible|learners|export)\b/.test(u));
      check("the certificates list asks the API for one page (page + limit)", pageReqs.length > 0 && pageReqs.every((u) => /[?&]page=\d+/.test(u) && /[?&]limit=\d+/.test(u) && !/limit=100\b/.test(u)), pageReqs.slice(0, 3));
    }

    // ---------------------------------------------------------------- 2. template designer on the real course
    await page.goto(`${PANEL}/certificates/templates/new`, { waitUntil: "networkidle2" });
    await page.waitForSelector("#cert-name");
    await fill(page, "#cert-name", `Template ${tag}`);
    await fill(page, "#cert-signer-0-name", "Arif Hossain");
    await fill(page, "#cert-signer-0-title", "Lead Instructor");
    await page.waitForFunction((t) => [...document.querySelectorAll("button[aria-pressed]")].some((b) => (b as HTMLElement).innerText.includes(t)), { timeout: 20000 }, `Cert Course ${tag}`);
    const chips = await page.$$eval("#cert-courses button[aria-pressed]", (bs) => bs.map((b) => (b as HTMLElement).innerText.trim()));
    check("designer course chips come from the API (only this workspace)", chips.includes(`Cert Course ${tag}`) && !chips.some((c) => c.includes("Other Course")) && !chips.includes("HTML Fundamentals"), chips);
    await realClick(page, "#cert-courses button[aria-pressed]", `Cert Course ${tag}`);
    await realClick(page, '#cert-status [role="radio"]', "Active");
    await page.click("#cert-rule-auto");
    await sleep(300);
    await page.screenshot({ path: `${SHOTS}/certs-1-designer.png` });
    await realClick(page, "button", "Create Template", true);
    const template = await until(() => p.certificateTemplate.findFirst({ where: { name: `Template ${tag}` } }), (t: any) => !!t);
    check("template created via the API (active, manual, on the real course)", template?.institutionId === inst.id && template?.status === "ACTIVE" && template?.autoIssue === false && template?.courseIds?.[0] === course.id, template && { status: template.status, autoIssue: template.autoIssue, courseIds: template.courseIds });

    // ---------------------------------------------------------------- 3. eligible queue + "Issue to all"
    await page.goto(`${PANEL}/certificates?tab=eligible`, { waitUntil: "networkidle2" });
    await waitForText(page, `Done Learner ${tag}`);
    const t3 = await text(page);
    check("eligible tab lists the learner who completed the course (not the 40% one)", t3.includes(`Done Learner ${tag}`) && !t3.includes(`Manual Learner ${tag}`) && t3.includes(`Cert Course ${tag}`));
    await page.screenshot({ path: `${SHOTS}/certs-2-eligible.png` });
    await realClick(page, "button", "Issue to all (1)");
    await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
    await realClick(page, '[role="dialog"] button', "Issue to All (1)");
    const autoCert = await until(() => p.certificate.findFirst({ where: { userId: done.id, courseId: course.id } }), (c: any) => !!c);
    check("Issue to all issued the certificate in the database", !!autoCert && autoCert.templateId === template.id && autoCert.institutionId === inst.id, autoCert && { templateId: autoCert.templateId });
    await page.reload({ waitUntil: "networkidle2" });
    await sleep(1500);
    check("eligible queue empties after issuing", !(await text(page)).includes(`Done Learner ${tag}`));

    // ---------------------------------------------------------------- 4. manual issue with the learner picker
    await page.goto(`${PANEL}/certificates`, { waitUntil: "networkidle2" });
    await waitForText(page, autoCert.certificateNumber);
    check("issued tab shows the certificate + its course title from the API", (await text(page)).includes(`Cert Course ${tag}`));
    await realClick(page, "button", "Issue Certificate", true);
    await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
    await pick(page, "Select a course", `Cert Course ${tag}`);
    await page.waitForFunction((n) => [...document.querySelectorAll('[role="dialog"] [role="option"]')].some((o) => (o as HTMLElement).innerText.includes(n)), { timeout: 15000 }, `Manual Learner ${tag}`);
    const options = await page.$$eval('[role="dialog"] [role="listbox"] [role="option"]', (os) => os.map((o) => ({ t: (o as HTMLElement).innerText, d: (o as HTMLButtonElement).disabled })));
    check(
      "learner picker lists the course's learners from the API, holder blocked",
      options.some((o) => o.t.includes(`Manual Learner ${tag}`) && !o.d) && options.some((o) => o.t.includes(`Done Learner ${tag}`) && o.d && o.t.includes("Has certificate")) && !options.some((o) => o.t.includes("Other Learner")),
      options,
    );
    await page.type('[role="dialog"] input[type="search"]', "Manual");
    await sleep(800);
    await realClick(page, '[role="dialog"] [role="option"]', `Manual Learner ${tag}`);
    await sleep(300);
    await page.screenshot({ path: `${SHOTS}/certs-3-issue-modal.png` });
    await realClick(page, '[role="dialog"] button[type="submit"]', "Issue Certificate", true);
    const manualCert = await until(() => p.certificate.findFirst({ where: { userId: manual.id, courseId: course.id } }), (c: any) => !!c);
    check("manual issue created a MANUAL certificate", manualCert?.method === "MANUAL", manualCert && { method: manualCert.method });

    // ---------------------------------------------------------------- 5. detail + revoke + restore
    await page.goto(`${PANEL}/certificates/${manualCert.id}`, { waitUntil: "networkidle2" });
    await waitForText(page, manualCert.certificateNumber);
    await waitForText(page, `Cert Course ${tag}`);
    check("detail page shows the certificate, course and activity", (await text(page)).includes(`Manual Learner ${tag}`));
    await realClick(page, "button", "Revoke Certificate", true);
    await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
    await realClick(page, '[role="dialog"] button[type="submit"]', "Revoke Certificate", true);
    const revoked = await until(() => p.certificate.findUnique({ where: { id: manualCert.id } }), (c: any) => c?.status === "REVOKED");
    check("revoke stored with the readable reason", revoked?.status === "REVOKED" && /Issued in error/.test(revoked?.revokedReason ?? ""), revoked && { status: revoked.status, reason: revoked.revokedReason });
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.innerText.trim() === "Restore Certificate"), { timeout: 20000 });
    await page.screenshot({ path: `${SHOTS}/certs-4-revoked.png` });
    await realClick(page, "button", "Restore Certificate", true);
    await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
    await realClick(page, '[role="dialog"] button', "Restore Certificate", true);
    const restored = await until(() => p.certificate.findUnique({ where: { id: manualCert.id } }), (c: any) => c?.status === "VALID");
    check("restore makes it valid again", restored?.status === "VALID");

    // ---------------------------------------------------------------- 6. verify modal
    await page.goto(`${PANEL}/certificates`, { waitUntil: "networkidle2" });
    await waitForText(page, "Verify Certificate");
    await realClick(page, "button", "Verify Certificate", true);
    await page.waitForSelector('[role="dialog"] input', { timeout: 10000 });
    await page.type('[role="dialog"] input', autoCert.verificationCode);
    await realClick(page, '[role="dialog"] button', "Verify", true);
    await waitForText(page, `Done Learner ${tag}`, 15000);
    const ver = await until(() => p.certificate.findUnique({ where: { id: autoCert.id } }), (c: any) => c?.verifications === 1);
    check("verify finds the certificate and counts the verification", ver?.verifications === 1, ver && { verifications: ver.verifications });
    await page.screenshot({ path: `${SHOTS}/certs-5-verify.png` });

    // ---------------------------------------------------------------- 7. isolation
    const foreign = await p.certificate.create({ data: { userId: otherStudent.id, courseId: otherCourse.id, certificateNumber: `${tag}-FOREIGN`, certificateUrl: "", verificationCode: `${tag}-foreign`, institutionId: other.id } });
    await page.goto(`${PANEL}/certificates/${foreign.id}`, { waitUntil: "networkidle2" });
    await sleep(2000);
    const t7 = await text(page);
    check("another workspace's certificate isn't shown", !t7.includes(`${tag}-FOREIGN`) && !t7.includes("Other Learner"), t7.slice(0, 200));
    await ctx.close();
  } catch (e) {
    console.log("FAIL exception", (e as Error).message || String(e).slice(0, 400));
    bad++;
    for (const [i, pg] of (await browser.pages()).entries()) {
      await pg.screenshot({ path: `${SHOTS}/certs-fail-${i}.png` }).catch(() => {});
      console.log(`  page ${i}: ${pg.url()} :: ${(await text(pg).catch(() => "")).slice(0, 500).replace(/\n/g, " | ")}`);
    }
  } finally {
    await browser.close();
    const retry = async (step: () => Promise<unknown>) => {
      for (let i = 0; i < 4; i++) {
        try {
          return await step();
        } catch (err) {
          if (i === 3) console.log("cleanup failed:", (err as Error).message.slice(0, 160));
          await sleep(1500);
        }
      }
    };
    const users = ids.users;
    const courses = (await p.course.findMany({ where: { institutionId: { in: ids.insts } }, select: { id: true } })).map((c: any) => c.id);
    await retry(() => p.certificate.deleteMany({ where: { OR: [{ courseId: { in: courses } }, { userId: { in: users } }] } }));
    await retry(() => p.certificateTemplate.deleteMany({ where: { institutionId: { in: ids.insts } } }));
    await retry(() => p.enrollment.deleteMany({ where: { courseId: { in: courses } } }));
    await retry(() => p.course.deleteMany({ where: { id: { in: courses } } }));
    await retry(() => p.category.deleteMany({ where: { institutionId: { in: ids.insts } } }));
    for (const t of ["notification"]) await retry(() => p[t]?.deleteMany({ where: { userId: { in: users } } }) ?? Promise.resolve());
    for (const t of ["teamEvent", "teamMember", "teamRole", "saasEvent"]) await retry(() => p[t].deleteMany({ where: { institutionId: { in: ids.insts } } }));
    await retry(() => p.activityLog.deleteMany({ where: { userId: { in: users } } }));
    await retry(() => p.user.deleteMany({ where: { OR: [{ id: { in: users } }, { email: { startsWith: tag } }] } }));
    await retry(() => p.institution.deleteMany({ where: { id: { in: ids.insts } } }));
    const left = await p.$queryRawUnsafe(
      `select (select count(*)::int from "User" where email like '${tag}%') users, (select count(*)::int from institutions where slug like '${tag}%') insts, (select count(*)::int from "Certificate" where "certificateNumber" like '${tag}%') foreign_certs`,
    );
    console.log(`\n${ok} passed, ${bad} failed | leftovers ${JSON.stringify(left)}`);
    await p.$disconnect();
  }
})();
