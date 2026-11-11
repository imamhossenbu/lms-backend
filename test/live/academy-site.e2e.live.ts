/**
 * Browser E2E for an academy website (lms-academy-site on :3003, academy picked with ?academy=<slug>) against the
 * real API and the SSLCommerz SANDBOX: home + newsletter sign-up + contact form + catalogue search (URL state) + course page, Enroll → sign-up (zod
 * errors) → emailed code → signed in → checkout, bad coupon error, coupon applied and kept on reload, pay with
 * the sandbox card + OTP → validated callback → result page "Payment successful", PAID order + enrollment + coupon
 * counted, My courses, "You're enrolled" on the course page, free course enrolment, sign out / sign back in.
 * Needs SSL_STORE_ID / SSL_STORE_PASSWORD (sandbox) and API_PUBLIC_URL in the API's .env. Cleanup in `finally`.
 */
import type { Page } from "puppeteer-core";
import { SHOTS, check, cleanup, launch, mkInstitution, mkUser, newTag, prisma as p, report, retry, sleep, text, until, waitForText, type Ids } from "./panel-e2e-helpers";

const SITE = process.env.LIVE_ACADEMY_URL ?? "http://localhost:3003";
const tag = newTag();
const ids: Ids = { users: [], insts: [] };
const safeText = (page: Page) => text(page).catch(() => "");
const clickText = (page: Page, label: string) =>
  page.evaluate((l) => {
    const el = [...document.querySelectorAll("a,button")].find((e) => (e.textContent || "").trim().startsWith(l) && (e as HTMLElement).offsetParent) as HTMLElement | undefined;
    el?.click();
    return !!el;
  }, label);

(async () => {
  const browser = await launch();
  try {
    const inst = await mkInstitution(ids, `${tag}-site`);
    const teacher = await mkUser(ids, tag, "Nadia Teacher", "TEACHER", inst.id);
    const cat = await p.category.create({ data: { name: "Design", slug: `${tag}-design`, status: "ACTIVE", institutionId: inst.id } });
    const mk = (title: string, price: number) =>
      p.course.create({
        data: { title, slug: title.toLowerCase().replace(/\s+/g, "-"), description: "<p>Learn <strong>layout</strong> and colour.</p>", shortDescription: `About ${title}`, categoryId: cat.id, instructorId: teacher.id, level: "Beginner", language: "English", price, isFree: price === 0, status: "PUBLISHED", durationMinutes: 90, institutionId: inst.id, learningOutcomes: JSON.stringify(["Design a clean screen"]) },
      });
    const paid = await mk(`${tag} Figma Basics`, 1500);
    const free = await mk(`${tag} Colour Intro`, 0);
    const mod = await p.courseModule.create({ data: { courseId: paid.id, title: "Getting started", order: 1 } });
    await p.lesson.create({ data: { courseId: paid.id, moduleId: mod.id, title: "Welcome lesson", type: "VIDEO", durationMinutes: 8, order: 1, isPreview: true, status: "PUBLISHED" } });
    const code = `${tag}TEN`.toUpperCase();
    await p.coupon.create({ data: { code, institutionId: inst.id, discountType: "PERCENTAGE", discountTypeValue: 10, courseId: paid.id, maxUses: 3, startDate: new Date(Date.now() - 864e5), endDate: new Date(Date.now() + 864e5), status: "ACTIVE" } });

    const page = await (await browser.createBrowserContext()).newPage();
    await page.setViewport({ width: 1366, height: 900 });

    // ---------------------------------------------------------------- browse
    await page.goto(`${SITE}/?academy=${inst.slug}`, { waitUntil: "networkidle2", timeout: 90000 });
    const home = await waitForText(page, paid.title).then(() => safeText(page));
    check("home shows the academy and its published courses", home.includes(inst.name) && home.includes(paid.title) && home.includes(free.title));

    // ---------------------------------------------------------------- newsletter
    const news = 'section input[aria-label="Email address"]';
    await page.click(`${news}`);
    await page.keyboard.press("Enter");
    await until(() => safeText(page), (t) => t.includes("Enter your email address"));
    await page.type(news, `${tag}-news@example.com`);
    await page.keyboard.press("Enter");
    await until(() => safeText(page), (t) => t.includes("on the list"));
    const sub = await p.newsletterSubscriber.findFirst({ where: { institutionId: inst.id, email: `${tag}-news@example.com` } });
    check("newsletter: empty email refused, valid email subscribed from the home page", sub?.status === "SUBSCRIBED" && sub.source === "home");

    // ---------------------------------------------------------------- contact form
    await page.goto(`${SITE}/contact`, { waitUntil: "networkidle2" });
    await page.waitForSelector("#contact-name");
    await clickText(page, "Send message");
    const cErr = await until(() => safeText(page), (t) => t.includes("Enter your name"));
    check("contact form shows field errors", cErr.includes("Enter a valid email address") || cErr.includes("Enter your email address"));
    await page.type("#contact-name", "Rumana Visitor");
    await page.type("#contact-email", `${tag}-visitor@example.com`);
    await clickText(page, "Payment");
    await page.type("#contact-message", "Can I pay for the Figma course with bKash in two parts?");
    await clickText(page, "Send message");
    await until(() => safeText(page), (t) => t.includes("Message sent!"));
    const msg = await p.academyContactMessage.findFirst({ where: { institutionId: inst.id, email: `${tag}-visitor@example.com` } });
    check("contact message stored for the admin (topic, status NEW)", msg?.topic === "PAYMENT" && msg.status === "NEW" && msg.name === "Rumana Visitor");

    await page.goto(`${SITE}/courses`, { waitUntil: "networkidle2" });
    await page.type('input[aria-label="Search courses"]', "figma");
    await until(async () => page.url(), (u) => u.includes("q=figma"));
    const cat1 = await until(() => safeText(page), (t) => t.includes(paid.title) && !t.includes(free.title));
    check("catalogue search filters and lives in the URL", cat1.includes("1 course"), page.url());
    await page.reload({ waitUntil: "networkidle2" });
    const cat2 = await safeText(page);
    check("reload keeps the search", cat2.includes(paid.title) && !cat2.includes(free.title));

    await page.goto(`${SITE}/courses/${paid.slug}`, { waitUntil: "networkidle2" });
    const cp = await safeText(page);
    check("course page: price, outline, preview lesson, instructor", cp.includes("৳1,500") && cp.includes("Getting started") && cp.includes("Welcome lesson") && cp.includes("Preview") && cp.includes("Nadia Teacher"));

    // ---------------------------------------------------------------- enrol → sign up
    await clickText(page, "Enroll now");
    await until(async () => page.url(), (u) => u.includes("/signup"));
    check("Enroll now → sign-up that returns to the checkout", page.url().includes("/signup?next=%2Fcheckout%2F"), page.url());
    await page.waitForSelector("#signup-name", { timeout: 30000 });
    await page.click("button[type=submit]");
    const errs = await until(() => safeText(page), (t) => t.includes("Enter your full name"));
    check("sign-up shows field errors", errs.includes("Enter your email address") && errs.includes("Use at least 8 characters"));
    const email = `${tag}-learner@example.com`;
    await page.type("#signup-name", "Rafi Learner");
    await page.type("#signup-email", email);
    await page.type("#signup-password", "Passw0rd!x");
    await page.click("button[type=submit]");
    await until(async () => page.url(), (u) => u.includes("step=verify"));
    const user = await until(() => p.user.findUnique({ where: { email } }), (u: any) => !!u?.verificationToken);
    ids.users.push(user.id);
    check("account created as this academy's PENDING learner", user.role === "STUDENT" && user.institutionId === inst.id && user.status === "PENDING");
    await page.reload({ waitUntil: "networkidle2" });
    check("reload stays on the code step", (await safeText(page)).includes("Check your email"));
    await page.click('input[aria-label="Digit 1"]');
    await page.keyboard.type(user.verificationToken, { delay: 40 });
    await until(async () => page.url(), (u) => u.includes(`/checkout/${paid.slug}`), 40);
    const co = await waitForText(page, "Order summary").then(() => safeText(page));
    check("code confirmed → signed in → checkout", co.includes("Rafi") && co.includes(paid.title) && co.includes("Pay ৳1,500"));

    // ---------------------------------------------------------------- coupon
    await page.type('input[aria-label="Coupon code"]', "NOPE");
    await clickText(page, "Apply");
    const bad = await until(() => safeText(page), (t) => t.includes("isn't valid"));
    check("bad coupon shows an error", bad.includes("Pay ৳1,500"));
    await page.$eval('input[aria-label="Coupon code"]', (e) => (e as HTMLInputElement).select());
    await page.type('input[aria-label="Coupon code"]', code.toLowerCase());
    await clickText(page, "Apply");
    const good = await until(() => safeText(page), (t) => t.includes("10% off"));
    check("coupon applied: −৳150, Pay ৳1,350", good.includes("−৳150") && good.includes("Pay ৳1,350") && page.url().includes(`coupon=${code}`));
    await page.reload({ waitUntil: "networkidle2" });
    check("reload keeps the coupon", (await safeText(page)).includes("Pay ৳1,350"));
    await page.screenshot({ path: `${SHOTS}/academy-checkout.png` });

    // ---------------------------------------------------------------- pay in the sandbox
    await Promise.all([page.waitForNavigation({ timeout: 60000 }), clickText(page, "Pay ৳1,350")]);
    check("Pay opens the SSLCommerz sandbox", page.url().startsWith("https://sandbox.sslcommerz.com/"), page.url());
    const order = await p.order.findFirst({ where: { userId: user.id, courseId: paid.id } });
    check("PENDING order of ৳1,350 saved", order?.status === "PENDING" && Number(order.totalAmount) === 1350);
    await page.waitForSelector('input[placeholder="Enter Card Number"]', { timeout: 30000 });
    for (const [ph, v] of [["Enter Card Number", "4111111111111111"], ["MM/YY", "1230"], ["CVC/CVV", "111"], ["Card Holder Name", "Rafi Learner"]]) await page.type(`input[placeholder="${ph}"]`, v, { delay: 30 });
    await sleep(600);
    const payBtn = await page.evaluateHandle(() => [...document.querySelectorAll("button,a,div")].find((e) => /^PAY /i.test((e.textContent || "").trim()) && (e as HTMLElement).offsetParent && e.children.length < 4));
    await (payBtn as any).click();
    await until(() => safeText(page), (t) => t.includes("OTP"), 40);
    await page.type("input[type=text],input[type=password],input:not([type])", "111111");
    await Promise.all([page.waitForNavigation({ timeout: 60000 }).catch(() => null), page.evaluate(() => ([...document.querySelectorAll("input[type=submit],button")].find((e) => (e as HTMLElement).offsetParent) as HTMLElement)?.click())]);
    await until(async () => page.url(), (u) => u.startsWith(`${SITE}/checkout/result`), 40);
    const res = await until(() => safeText(page), (t) => t.includes("Payment successful"));
    check("back on the academy site: Payment successful", res.includes(order!.orderNumber) && res.includes("৳1,350"), page.url());
    await page.screenshot({ path: `${SHOTS}/academy-paid.png` });
    const after = await p.order.findUnique({ where: { id: order!.id } });
    const enr = await p.enrollment.findFirst({ where: { userId: user.id, courseId: paid.id } });
    const cp2 = await p.coupon.findFirst({ where: { code } });
    check("order PAID via SSLCommerz, learner enrolled, coupon counted", after.status === "PAID" && after.paymentMethod === "SSLCommerz" && !!enr && cp2.usedCount === 1);

    // ---------------------------------------------------------------- my courses + enrolled state
    await page.goto(`${SITE}/my-courses`, { waitUntil: "networkidle2" });
    check("My courses lists the bought course", (await safeText(page)).includes(paid.title));
    await page.goto(`${SITE}/courses/${paid.slug}`, { waitUntil: "networkidle2" });
    check("course page says You're enrolled", (await safeText(page)).includes("You're enrolled"));
    await page.goto(`${SITE}/checkout/${paid.slug}`, { waitUntil: "networkidle2" });
    check("checkout of an owned course → already enrolled", (await safeText(page)).includes("You're already enrolled"));

    // ---------------------------------------------------------------- free course
    await page.goto(`${SITE}/checkout/${free.slug}`, { waitUntil: "networkidle2" });
    await clickText(page, "Enroll now");
    const fr = await until(() => safeText(page), (t) => t.includes("You're enrolled!"));
    check("free course → enrolled, no payment", fr.includes(free.title) && !!(await p.enrollment.findFirst({ where: { userId: user.id, courseId: free.id } })));

    // ---------------------------------------------------------------- sign out / in
    await page.click('button[aria-haspopup="menu"]');
    await page.waitForSelector('[role="menu"]');
    await clickText(page, "Sign out");
    const out = await until(() => safeText(page), (t) => t.includes("Get started"));
    check("Sign out from the user menu", out.includes("Sign in") && !(await page.$('button[aria-haspopup="menu"]')));
    await page.goto(`${SITE}/my-courses`, { waitUntil: "networkidle2" });
    await until(async () => page.url(), (u) => u.includes("/login"));
    check("signed out: My courses asks to sign in", page.url().includes("/login?next=%2Fdashboard"), page.url());
    await page.waitForSelector("#login-email", { timeout: 30000 });
    await page.type("#login-email", email);
    await page.type("#login-password", "wrong-pass");
    await page.click("button[type=submit]");
    await until(() => safeText(page), (t) => t.includes("No learner account"));
    await page.$eval("#login-password", (e) => (e as HTMLInputElement).select());
    await page.type("#login-password", "Passw0rd!x");
    await page.click("button[type=submit]");
    await until(async () => page.url(), (u) => u.includes("/dashboard?tab=courses"));
    const mc = await waitForText(page, free.title).then(() => safeText(page));
    check("wrong password refused, right one returns to My courses", mc.includes(paid.title) && mc.includes(free.title));
  } catch (err) {
    check("suite crashed", false, (err as Error).stack);
    for (const [i, pg] of (await browser.pages()).entries()) await pg.screenshot({ path: `${SHOTS}/academy-fail-${i}.png` }).catch(() => {});
  } finally {
    await browser.close();
    await cleanup(ids, tag, async (courses) => {
      const orders = (await p.order.findMany({ where: { courseId: { in: courses } }, select: { id: true } })).map((o: any) => o.id);
      await retry(() => p.couponUsage.deleteMany({ where: { orderId: { in: orders } } }));
      await retry(() => p.payment.deleteMany({ where: { orderId: { in: orders } } }));
      await retry(() => p.orderEvent.deleteMany({ where: { orderId: { in: orders } } }));
      await retry(() => p.invoice.deleteMany({ where: { orderId: { in: orders } } }));
      await retry(() => p.order.deleteMany({ where: { id: { in: orders } } }));
      await retry(() => p.coupon.deleteMany({ where: { institutionId: { in: ids.insts } } }));
      await retry(() => p.newsletterSubscriber.deleteMany({ where: { institutionId: { in: ids.insts } } }));
      await retry(() => p.academyContactMessage.deleteMany({ where: { institutionId: { in: ids.insts } } }));
    });
    await report(tag);
  }
})();
