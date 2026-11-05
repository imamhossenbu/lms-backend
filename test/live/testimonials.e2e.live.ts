/**
 * Browser E2E for owner-managed testimonials: the Owner Console › Testimonials page (empty state, zod
 * validation, add as draft, publish from the row menu, feature, delete with confirm) and the marketing website
 * showing only published ones (carousel with arrows when there are more than three). API rules: owner only,
 * DTO validation, public endpoint hides drafts. Console :3011, website :3002, API :4077. Cleanup in `finally`.
 */
import * as bcrypt from "bcrypt";
import type { Page } from "puppeteer-core";
import { SHOTS, check, fill, launch, newTag, prisma as p, realClick, result, sleep, text, until, waitForText } from "./panel-e2e-helpers";

const CONSOLE = process.env.LIVE_CONSOLE_URL ?? "http://localhost:3011";
const SITE = process.env.LIVE_WEBSITE_URL ?? "http://localhost:3002";
const API = process.env.LIVE_API_URL ?? "http://localhost:4077";
const tag = newTag();

async function api(token: string | null, method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}
/** Clicks the row ⋯ menu of `name`, then `item`. */
async function rowMenu(page: Page, name: string, item: string) {
  await page.click(`button[aria-label="Actions for ${name}"]`);
  await page.waitForSelector('[role="menuitem"]', { timeout: 10000 });
  await realClick(page, '[role="menuitem"]', item);
}

(async () => {
  const users: string[] = [];
  const browser = await launch();
  try {
    const before = await p.testimonial.count();
    const owner = await p.user.create({ data: { name: "E2E Owner", email: `${tag}-owner@example.com`, password: await bcrypt.hash("Owner12345", 10), role: "SUPER_ADMIN", status: "ACTIVE", emailVerified: true } });
    const admin = await p.user.create({ data: { name: "E2E Admin", email: `${tag}-admin@example.com`, password: await bcrypt.hash("Admin12345", 10), role: "ADMIN", status: "ACTIVE", emailVerified: true } });
    users.push(owner.id, admin.id);

    // ---------------------------------------------------------------- API rules
    const tAdmin = (await api(null, "POST", "/auth/login", { email: admin.email, password: "Admin12345" })).body?.token;
    const forbidden = await api(tAdmin, "GET", "/saas/owner/testimonials");
    check("only the platform owner can manage testimonials", forbidden.status === 403, forbidden.status);
    const tOwner = (await api(null, "POST", "/auth/login", { email: owner.email, password: "Owner12345" })).body?.token;
    const bad = await api(tOwner, "POST", "/saas/owner/testimonials", { quote: "short", name: "X", avatarUrl: "http://insecure" });
    check("the API validates testimonials (400)", bad.status === 400, bad.body?.message);

    // ---------------------------------------------------------------- console page
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    page.on("dialog", (d) => void d.accept());
    await page.goto(`${CONSOLE}/login`, { waitUntil: "networkidle2" });
    await fill(page, "#console-email", owner.email);
    await fill(page, "#console-password", "Owner12345");
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => location.pathname === "/", { timeout: 25000 });
    await page.goto(`${CONSOLE}/testimonials`, { waitUntil: "networkidle2" });
    await waitForText(page, "Add testimonial");
    await sleep(800);
    if (before === 0) check("empty state invites the first testimonial", (await text(page)).includes("No testimonials yet"));

    await realClick(page, "button", "Add testimonial");
    await page.waitForSelector("#t-quote");
    await realClick(page, 'button[type="submit"]', "Add testimonial");
    await sleep(500);
    const tv = await text(page);
    check("empty form shows field errors", tv.includes("at least 20 characters") && tv.includes("Enter the person's name"), tv.slice(0, 200));

    const name = `Tester ${tag}`;
    await fill(page, "#t-quote", `EduPro runs our whole academy now — classes, exams and fees ${tag}.`);
    await fill(page, "#t-name", name);
    await fill(page, "#t-role", "Principal, Test School");
    // Save as draft: switch "Published" off.
    await page.evaluate(() => {
      const row = [...document.querySelectorAll<HTMLElement>("*")].find((e) => e.childElementCount === 0 && e.innerText?.trim() === "Published" && e.closest("form"));
      let el: HTMLElement | null = row ?? null;
      while (el && !el.querySelector('[role="switch"]')) el = el.parentElement;
      el?.querySelector<HTMLElement>('[role="switch"]')?.click();
    });
    await realClick(page, 'button[type="submit"]', "Add testimonial");
    const draft = await until(() => p.testimonial.findFirst({ where: { name } }), (t: any) => !!t);
    check("testimonial added as a draft", !!draft && draft.isPublished === false && draft.role === "Principal, Test School", draft);
    await waitForText(page, name);
    const pubDraft = await api(null, "GET", "/saas/public/testimonials");
    check("drafts are not public", !pubDraft.body.some((t: any) => t.name === name));

    await rowMenu(page, name, "Publish");
    const live = await until(() => p.testimonial.findFirst({ where: { name } }), (t: any) => t?.isPublished === true);
    check("publish from the row menu", live?.isPublished === true);
    await rowMenu(page, name, "Highlight as featured");
    const feat = await until(() => p.testimonial.findFirst({ where: { name } }), (t: any) => t?.featured === true);
    check("feature from the row menu", feat?.featured === true);
    const pub = await api(null, "GET", "/saas/public/testimonials");
    check("published testimonial is public (without internal fields)", pub.body.some((t: any) => t.name === name && t.featured && !("isPublished" in t)), pub.body.length);
    await page.screenshot({ path: `${SHOTS}/testimonials-1-console.png` });

    // Three more published ones so the website carousel has two pages.
    for (let i = 1; i <= 3; i++) {
      await api(tOwner, "POST", "/saas/owner/testimonials", { quote: `Another real-looking quote number ${i} for the carousel test ${tag}.`, name: `Extra ${i} ${tag}`, role: "Teacher", isPublished: true, order: i });
    }

    // ---------------------------------------------------------------- website
    const site = await ctx.newPage();
    await site.setViewport({ width: 1440, height: 900 });
    let shown = false;
    // The site caches testimonials for 60s (stale-while-revalidate), so keep reloading for up to ~90s.
    for (let attempt = 0; attempt < 9 && !shown; attempt++) {
      await site.goto(SITE, { waitUntil: "networkidle2" });
      for (let y = 0; y <= 5200; y += 400) {
        await site.evaluate((v) => window.scrollTo(0, v), y);
        await sleep(80);
      }
      await sleep(1500);
      const t = await text(site);
      shown = t.includes(name) || t.includes(`Extra 1 ${tag}`);
      if (!shown) await sleep(8000);
    }
    check("website shows the published testimonials", shown);
    check("carousel gets arrows with more than three", !!(await site.$('button[aria-label="Next testimonials"]')));
    const activeDot = () => site.evaluate(() => [...document.querySelectorAll('button[aria-label^="Show testimonial "]')].findIndex((b) => b.getAttribute("aria-current") === "true"));
    const startDot = await activeDot();
    // Swipe the track left with the mouse: it should snap to a later card.
    await site.evaluate(() => document.querySelector('[aria-roledescription="carousel"]')?.scrollIntoView({ block: "center" }));
    await sleep(800);
    const box = await (await site.$('[aria-roledescription="carousel"] .cursor-grab'))?.boundingBox();
    if (box) {
      const y = box.y + box.height / 2;
      await site.mouse.move(900, y);
      await site.mouse.down();
      for (let i = 1; i <= 10; i++) await site.mouse.move(900 - i * 50, y, { steps: 2 });
      await site.mouse.up();
      await sleep(900);
    }
    const swiped = await activeDot();
    check("swiping the track moves to the next testimonials", swiped !== startDot && swiped >= 0, { startDot, swiped });
    await site.click('button[aria-label="Previous testimonials"]');
    await sleep(700);
    check("arrows slide back", (await activeDot()) === (swiped + 3) % 4, await activeDot());
    // The orange card is the middle one of the three in view.
    const mid = await site.evaluate(() => {
      const track = document.querySelector('[aria-roledescription="carousel"]')!.getBoundingClientRect();
      const orange = [...document.querySelectorAll<HTMLElement>('[aria-roledescription="carousel"] figure')].filter((f) => f.querySelector("blockquote")?.className.includes("text-white"));
      const r = orange[0]?.getBoundingClientRect();
      return orange.length === 1 && !!r && Math.abs(r.left + r.width / 2 - (track.left + track.width / 2)) < 40;
    });
    check("the middle card is the orange one", mid);
    await site.screenshot({ path: `${SHOTS}/testimonials-2-site.png` });
    await site.close();
    await page.bringToFront();

    // ---------------------------------------------------------------- delete
    await rowMenu(page, name, "Delete");
    await page.waitForSelector('[role="dialog"]');
    await realClick(page, '[role="dialog"] button', "Delete", true);
    const gone = await until(() => p.testimonial.findFirst({ where: { name } }), (t) => !t);
    check("delete removes it", !gone);
    await ctx.close();
  } catch (e) {
    console.log("FAIL exception", (e as Error).message || String(e).slice(0, 400));
    result.bad++;
  } finally {
    await browser.close();
    await p.testimonial.deleteMany({ where: { OR: [{ name: { contains: tag } }, { quote: { contains: tag } }] } });
    await p.user.deleteMany({ where: { OR: [{ id: { in: users } }, { email: { startsWith: tag } }] } });
    const left = await p.testimonial.count({ where: { OR: [{ name: { contains: tag } }, { quote: { contains: tag } }] } });
    console.log(`\n${result.ok} passed, ${result.bad} failed | leftovers ${JSON.stringify({ testimonials: left })}`);
    await p.$disconnect();
  }
})();
