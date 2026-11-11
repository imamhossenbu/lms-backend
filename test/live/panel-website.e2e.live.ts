/**
 * Browser E2E for the panel's Website page (/website): content form validation + save + reload (hero, FAQ,
 * social link), saved content shows on the public academy profile, contact messages (list, open → read,
 * archive, archived filter, delete), newsletter subscribers (stats, search, unsubscribe), ?tab= survives reloads,
 * another workspace's admin sees none of it. Panel on :3010 (LIVE_PANEL_URL), API with CORS_ORIGINS for it.
 */
import { PANEL, SHOTS, check, cleanup, fill, launch, login, mkInstitution, mkUser, newTag, prisma as p, realClick, report, retry, text, until, waitForText, type Ids } from "./panel-e2e-helpers";

const API = process.env.LIVE_API_URL ?? "http://localhost:4077";
const tag = newTag();
const post = (path: string, body: unknown) => fetch(`${API}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

(async () => {
  const ids: Ids = { users: [], insts: [] };
  const browser = await launch();
  try {
    const inst = await mkInstitution(ids, tag);
    const other = await mkInstitution(ids, `${tag}-other`);
    const admin = await mkUser(ids, tag, "Website Admin", "ADMIN", inst.id);
    const otherAdmin = await mkUser(ids, tag, "Other Admin", "ADMIN", other.id);

    // Visitors: two contact messages and three newsletter sign-ups on the academy site.
    await post(`/academy/public/${inst.slug}/contact`, { name: "Karim Visitor", email: `${tag}-karim@example.com`, topic: "PAYMENT", message: "Can I pay with bKash in two parts?" });
    await post(`/academy/public/${inst.slug}/contact`, { name: "Lina Visitor", email: `${tag}-lina@example.com`, topic: "COURSE", message: "Is the React course good for beginners?" });
    for (const n of ["one", "two", "three"]) await post(`/academy/public/${inst.slug}/newsletter`, { email: `${tag}-${n}@example.com`, source: "home" });

    const { page } = await login(browser, admin.email);

    // ---------------------------------------------------------------- content: validation, save, reload
    await page.goto(`${PANEL}/website`, { waitUntil: "networkidle2" });
    await page.waitForSelector("#web-hero-title", { timeout: 30000 });
    const t0 = await text(page);
    check("Website page: content tab with the On your site summary", t0.includes("On your site") && t0.includes("Hidden until you write it"));
    await page.screenshot({ path: `${SHOTS}/web-1-content.png` });

    await fill(page, "#web-hero-title", "Code_ Your Future");
    await fill(page, "#web-social-facebook", "http://insecure.example");
    await realClick(page, "button", "Save changes");
    await waitForText(page, "Please fix the highlighted fields");
    check("an http:// social link is refused (nothing saved)", !(await p.academySite.findUnique({ where: { institutionId: inst.id } })));

    await fill(page, "#web-social-facebook", "https://facebook.com/e2e-academy");
    await realClick(page, "button", "Add question");
    await page.waitForSelector("#web-faq-q-0");
    await fill(page, "#web-faq-q-0", "Do you offer certificates?");
    await fill(page, "#web-faq-a-0", "Yes — finish the course to get one.");
    await realClick(page, "button", "Save changes");
    const saved = await until(() => p.academySite.findUnique({ where: { institutionId: inst.id } }), (r: any) => r?.content?.hero?.title === "Code_ Your Future");
    check("content saved (hero, FAQ, socials)", saved?.content?.faqs?.length === 1 && saved?.content?.socials?.facebook === "https://facebook.com/e2e-academy", saved?.content);
    await waitForText(page, "Website updated");
    await page.reload({ waitUntil: "networkidle2" });
    await page.waitForSelector("#web-faq-q-0", { timeout: 30000 });
    const back = await page.$eval("#web-hero-title", (e) => (e as HTMLInputElement).value);
    check("saved content is read back after a reload", back === "Code_ Your Future");
    const pub = await (await fetch(`${API}/academy/public/${inst.slug}`)).json();
    check("the public academy profile serves the new content", pub.site?.hero?.title === "Code_ Your Future" && pub.site?.faqs?.[0]?.question === "Do you offer certificates?", pub.site);

    // ---------------------------------------------------------------- messages
    await realClick(page, "button", "Messages");
    await until(async () => page.url(), (u) => u.includes("tab=messages"));
    const m0 = await waitForText(page, "Karim Visitor").then(() => text(page));
    check("Messages tab lists both messages", m0.includes("Lina Visitor") && m0.includes("Payment"));
    await page.reload({ waitUntil: "networkidle2" });
    await waitForText(page, "Karim Visitor");
    check("?tab=messages survives a reload", page.url().includes("tab=messages"));
    await page.evaluate(() => ([...document.querySelectorAll("tr")].find((r) => r.textContent?.includes("Karim Visitor")) as HTMLElement)?.click());
    await waitForText(page, "Reply by email");
    const karim = await until(() => p.academyContactMessage.findFirst({ where: { institutionId: inst.id, name: "Karim Visitor" } }), (m: any) => m?.status === "READ");
    check("opening a new message marks it read", karim?.status === "READ");
    await realClick(page, "button", "Archive");
    await until(() => p.academyContactMessage.findFirst({ where: { id: karim.id } }), (m: any) => m?.status === "ARCHIVED");
    const tableText = () => page.evaluate(() => document.querySelector("table")?.innerText ?? "");
    const m1 = await until(tableText, (t) => !t.includes("Karim Visitor"));
    check("archived message leaves the inbox list", !m1.includes("Karim Visitor") && m1.includes("Lina Visitor"));
    await page.goto(`${PANEL}/website?tab=messages&status=ARCHIVED`, { waitUntil: "networkidle2" });
    check("Archived filter shows it", (await waitForText(page, "Karim Visitor").then(() => text(page))).includes("Karim Visitor"));
    await page.screenshot({ path: `${SHOTS}/web-2-messages.png` });

    // ---------------------------------------------------------------- subscribers
    await page.goto(`${PANEL}/website?tab=subscribers`, { waitUntil: "networkidle2" });
    const s0 = await waitForText(page, `${tag}-one@example.com`).then(() => text(page));
    check("Subscribers tab: list + stats", s0.includes("Total sign-ups") && s0.includes(`${tag}-three@example.com`));
    await page.type('input[aria-label="Search email or name..."]', "two");
    await until(async () => page.url(), (u) => u.includes("q=two"));
    const s1 = await until(() => text(page), (t) => t.includes(`${tag}-two@example.com`) && !t.includes(`${tag}-one@example.com`));
    check("search filters subscribers (in the URL)", !s1.includes(`${tag}-three@example.com`));
    const rowMenu = await page.evaluateHandle((needle) => [...document.querySelectorAll("tr")].find((r) => r.textContent?.includes(needle))?.querySelector('button[aria-label="More actions"]') ?? null, `${tag}-two@example.com`);
    await (rowMenu.asElement() as any).click();
    await realClick(page, '[role="menuitem"]', "Unsubscribe");
    const two = await until(() => p.newsletterSubscriber.findFirst({ where: { institutionId: inst.id, email: `${tag}-two@example.com` } }), (s: any) => s?.status === "UNSUBSCRIBED");
    check("Unsubscribe from the row menu", two?.status === "UNSUBSCRIBED");
    await page.screenshot({ path: `${SHOTS}/web-3-subscribers.png` });

    // ---------------------------------------------------------------- isolation
    const tok = (await (await post("/auth/login", { email: otherAdmin.email, password: "Admin12345" })).json()).token;
    const auth = { headers: { Authorization: `Bearer ${tok}` } };
    const om = await (await fetch(`${API}/admin/website/messages?status=ARCHIVED`, auth)).json();
    const os = await (await fetch(`${API}/admin/website/subscribers`, auth)).json();
    const del = await fetch(`${API}/admin/website/messages/${karim.id}`, { method: "DELETE", ...auth });
    check("another workspace sees no messages / subscribers and can't delete them", om.pagination?.total === 0 && os.pagination?.total === 0 && del.status === 404, { om: om.pagination, os: os.pagination, del: del.status });
  } catch (err) {
    check("suite crashed", false, (err as Error).stack);
    for (const [i, pg] of (await browser.pages()).entries()) await pg.screenshot({ path: `${SHOTS}/web-fail-${i}.png` }).catch(() => {});
  } finally {
    await browser.close();
    await cleanup(ids, tag, async () => {
      await retry(() => p.academyContactMessage.deleteMany({ where: { institutionId: { in: ids.insts } } }));
      await retry(() => p.newsletterSubscriber.deleteMany({ where: { institutionId: { in: ids.insts } } }));
      await retry(() => p.academySite.deleteMany({ where: { institutionId: { in: ids.insts } } }));
    });
    await report(tag);
  }
})();
