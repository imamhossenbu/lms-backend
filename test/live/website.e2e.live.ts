/**
 * Browser E2E for the marketing website (lms-website) against the real API: home renders the live plans, the
 * pricing toggle switches to yearly prices and the trial links pre-select plan + cycle on the panel sign-up,
 * the comparison table, feature anchors, the mobile menu, the contact form (validation, topic from ?topic=,
 * stored lead, honeypot ignored) and the 404 page. Website on :3002 (LIVE_WEBSITE_URL). Cleanup in `finally`.
 */
import { SHOTS, check, launch, newTag, prisma as p, realClick, result, sleep, text, until, waitForText } from "./panel-e2e-helpers";

const SITE = process.env.LIVE_WEBSITE_URL ?? "http://localhost:3002";
const API = process.env.LIVE_API_URL ?? "http://localhost:4077";
const tag = newTag();

(async () => {
  const browser = await launch();
  try {
    const plans = ((await (await fetch(`${API}/saas/public/plans`)).json()) as any[]).filter((x) => x.isPublic && !x.archived && x.priceMonthly > 0);
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // ---------------------------------------------------------------- home
    await page.goto(SITE, { waitUntil: "networkidle2" });
    const t0 = await text(page);
    check("home renders the hero and features", t0.includes("Run your whole academy") && t0.includes("Live classes") && t0.includes("Certificates"));
    check("home shows the live plans from the API", plans.every((pl) => t0.includes(pl.name)) && t0.includes(`$${plans[0].priceMonthly}`), plans.map((x) => x.name));
    await page.screenshot({ path: `${SHOTS}/site-1-home.png`, fullPage: true });

    // ---------------------------------------------------------------- pricing
    await page.goto(`${SITE}/pricing`, { waitUntil: "networkidle2" });
    const first = plans[0];
    const trial = await page.$$eval("a", (as) => as.map((a) => (a as HTMLAnchorElement).href).filter((h) => h.includes("/signup?plan=")));
    check("trial buttons pre-select the plan (monthly)", trial.some((h) => h.includes(`plan=${first.id}`) && h.includes("cycle=MONTHLY")), trial);
    await realClick(page, '[role="radio"]', "Yearly");
    await sleep(500);
    const yearlyMonthly = `$${Math.round(first.priceYearly / 12)}`;
    const t1 = await text(page);
    const trialY = await page.$$eval("a", (as) => as.map((a) => (a as HTMLAnchorElement).href).filter((h) => h.includes("/signup?plan=")));
    check("yearly toggle shows yearly prices and links", t1.includes(yearlyMonthly) && t1.includes(`$${first.priceYearly.toLocaleString("en-US")} billed yearly`) && trialY.every((h) => h.includes("cycle=YEARLY")), { yearlyMonthly });
    const rows = await page.$$eval("table tbody tr", (trs) => trs.length);
    check("comparison table lists limits and features", rows >= 6 && t1.includes("Compare every plan"), rows);
    await page.screenshot({ path: `${SHOTS}/site-2-pricing.png`, fullPage: true });

    // ---------------------------------------------------------------- features + anchors
    await page.goto(`${SITE}/features#payments`, { waitUntil: "networkidle2" });
    await sleep(600);
    const anchored = await page.evaluate(() => {
      const el = document.getElementById("payments");
      return !!el && Math.abs(el.getBoundingClientRect().top) < 200;
    });
    check("feature anchors scroll to their section", anchored);

    // ---------------------------------------------------------------- mobile menu
    const m = await ctx.newPage();
    await m.setViewport({ width: 390, height: 844, isMobile: true });
    await m.goto(SITE, { waitUntil: "networkidle2" });
    const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    await m.click('button[aria-label="Open menu"]');
    await sleep(400);
    const menu = await text(m);
    check("mobile: no sideways scroll, menu opens with the links", !overflow && menu.includes("Pricing") && menu.includes("Sign in"), { overflow });
    await m.screenshot({ path: `${SHOTS}/site-3-mobile.png` });
    await m.close();

    // ---------------------------------------------------------------- contact
    await page.goto(`${SITE}/contact?topic=SALES`, { waitUntil: "networkidle2" });
    await page.waitForSelector("#contact-name");
    check("?topic= pre-selects the topic", (await page.$eval("#contact-topic", (e) => (e as HTMLSelectElement).value)) === "SALES");
    await realClick(page, 'button[type="submit"]', "Send message");
    await sleep(500);
    const t2 = await text(page);
    check("empty form shows field errors", t2.includes("Enter your name") && t2.includes("Enter a valid email address"));
    const email = `${tag}@example.com`;
    await page.type("#contact-name", "Website Tester");
    await page.type("#contact-email", email);
    await page.type("#contact-institution", `School ${tag}`);
    await page.select("#contact-size", "101-500");
    await page.type("#contact-message", "We would like to move our coaching centre online.");
    await realClick(page, 'button[type="submit"]', "Send message");
    await waitForText(page, "Thanks, Website");
    const lead = await until(() => p.marketingLead.findFirst({ where: { email } }), (l: any) => !!l);
    check("contact form stores the lead", lead?.topic === "SALES" && lead?.studentCount === "101-500" && lead?.institutionName === `School ${tag}`, lead);
    await page.screenshot({ path: `${SHOTS}/site-4-contact.png` });

    const bot = await fetch(`${API}/saas/public/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Bot", email: `${tag}-bot@example.com`, topic: "OTHER", message: "Buy cheap things now!!", website: "http://spam" }),
    });
    check("honeypot submissions are accepted but not stored", bot.status === 201 && (await p.marketingLead.count({ where: { email: `${tag}-bot@example.com` } })) === 0, bot.status);
    const bad = await fetch(`${API}/saas/public/contact`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "X", email: "nope", topic: "NOPE", message: "short" }) });
    check("the API validates the form too (400)", bad.status === 400, bad.status);

    // ---------------------------------------------------------------- 404
    const res = await page.goto(`${SITE}/no-such-page`, { waitUntil: "networkidle2" });
    check("unknown pages show the 404 page", res?.status() === 404 && (await text(page)).includes("This page doesn't exist"));
    await ctx.close();
  } catch (e) {
    console.log("FAIL exception", (e as Error).message || String(e).slice(0, 400));
    result.bad++;
  } finally {
    await browser.close();
    await p.marketingLead.deleteMany({ where: { email: { startsWith: tag } } });
    const left = await p.marketingLead.count({ where: { email: { startsWith: tag } } });
    console.log(`\n${result.ok} passed, ${result.bad} failed | leftovers ${JSON.stringify({ leads: left })}`);
    await p.$disconnect();
  }
})();
