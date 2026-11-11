/**
 * Browser E2E for the learner dashboard (lms-academy-site /dashboard on :3003, ?academy=<slug>): overview stats +
 * Continue learning + upcoming live class, ?tab= survives reloads, live classes (join link only near the start,
 * recording for past ones), assignments (text answer validated + submitted, then shown as Submitted; graded one
 * shows marks + feedback), quiz results table, certificates (verify link), orders (PAID with invoice), profile save
 * (header name updates) and password change (old password stops working), /my-courses → dashboard. Cleanup in `finally`.
 */
import type { Page } from "puppeteer-core";
import { SHOTS, check, cleanup, launch, mkInstitution, mkUser, newTag, prisma as p, report, retry, text, until, waitForText, type Ids } from "./panel-e2e-helpers";

const SITE = process.env.LIVE_ACADEMY_URL ?? "http://localhost:3003";
const API = process.env.LIVE_API_URL ?? "http://localhost:4077";
const tag = newTag();
const ids: Ids = { users: [], insts: [] };
const safeText = (page: Page) => text(page).catch(() => "");
const clickText = (page: Page, label: string) =>
  page.evaluate((l) => {
    const el = [...document.querySelectorAll("a,button")].reverse().find((e) => (e.textContent || "").trim().startsWith(l) && (e as HTMLElement).offsetParent) as HTMLElement | undefined;
    el?.click();
    return !!el;
  }, label);
const hydrated = (page: Page) => page.waitForNetworkIdle({ idleTime: 500, timeout: 30000 }).catch(() => null);

(async () => {
  const browser = await launch();
  try {
    const inst = await mkInstitution(ids, `${tag}-dash`);
    const teacher = await mkUser(ids, tag, "Dash Teacher", "TEACHER", inst.id);
    const learner = await mkUser(ids, tag, "Dash Learner", "STUDENT", inst.id);
    const cat = await p.category.create({ data: { name: "Dev", slug: `${tag}-dev`, status: "ACTIVE", institutionId: inst.id } });
    const course = await p.course.create({
      data: { title: `${tag} Dashboard Course`, slug: `${tag}-dash-course`, description: "d", shortDescription: "s", categoryId: cat.id, instructorId: teacher.id, level: "Beginner", language: "English", price: 1000, isFree: false, status: "PUBLISHED", durationMinutes: 30, institutionId: inst.id },
    });
    const mod = await p.courseModule.create({ data: { courseId: course.id, title: "M1", order: 1 } });
    const l1 = await p.lesson.create({ data: { courseId: course.id, moduleId: mod.id, title: "Lesson one", type: "TEXT", durationMinutes: 5, order: 1, status: "PUBLISHED", content: "<p>x</p>" } });
    await p.lesson.create({ data: { courseId: course.id, moduleId: mod.id, title: "Lesson two", type: "TEXT", durationMinutes: 5, order: 2, status: "PUBLISHED", content: "<p>y</p>" } });
    await p.enrollment.create({ data: { userId: learner.id, courseId: course.id, status: "ACTIVE", progressPercentage: 50, lastAccessedAt: new Date() } });
    await p.lessonProgress.create({ data: { userId: learner.id, courseId: course.id, lessonId: l1.id, isCompleted: true, completedAt: new Date(), watchedSeconds: 0, lastPosition: 0 } });
    const now = Date.now();
    await p.liveClass.create({ data: { institutionId: inst.id, courseId: course.id, instructorId: teacher.id, title: "Soon class", meetingUrl: "https://meet.example.com/soon", startTime: new Date(now + 10 * 60_000), endTime: new Date(now + 70 * 60_000), status: "SCHEDULED" } });
    await p.liveClass.create({ data: { institutionId: inst.id, courseId: course.id, instructorId: teacher.id, title: "Later class", meetingUrl: "https://meet.example.com/later", startTime: new Date(now + 3 * 864e5), endTime: new Date(now + 3 * 864e5 + 3600e3), status: "SCHEDULED" } });
    await p.liveClass.create({ data: { institutionId: inst.id, courseId: course.id, instructorId: teacher.id, title: "Past class", meetingUrl: "https://meet.example.com/past", recordingUrl: "https://video.example.com/rec", startTime: new Date(now - 2 * 864e5), endTime: new Date(now - 2 * 864e5 + 3600e3), status: "SCHEDULED" } });
    const textAsg = await p.assignment.create({ data: { institutionId: inst.id, courseId: course.id, title: "Write a summary", dueDate: new Date(now + 5 * 864e5), marks: 20, allowedFileTypes: "", status: "PUBLISHED", type: "TEXT", instructionsHtml: "<p>Summarise <strong>module 1</strong>.</p><script>window.__x=1</script>" } });
    const gradedAsg = await p.assignment.create({ data: { institutionId: inst.id, courseId: course.id, title: "Graded task", dueDate: new Date(now - 864e5), marks: 10, allowedFileTypes: "", status: "PUBLISHED", type: "LINK" } });
    await p.assignmentSubmission.create({ data: { assignmentId: gradedAsg.id, userId: learner.id, textAnswer: "https://github.com/x/y", status: "GRADED", marksObtained: 8, feedback: "Nice work!", gradedAt: new Date() } });
    const quiz = await p.quiz.create({ data: { institutionId: inst.id, courseId: course.id, title: "Module quiz", passingScore: 6, totalMarks: 10, status: "PUBLISHED" } });
    await p.quizAttempt.create({ data: { quizId: quiz.id, userId: learner.id, answers: "[]", score: 8, totalMarks: 10, percentage: 80, parsed: true, passed: true, submittedAt: new Date() } });
    await p.certificate.create({ data: { userId: learner.id, courseId: course.id, certificateNumber: `${tag}-CERT`, certificateUrl: "", verificationCode: `${tag}VERIFY`, institutionId: inst.id } });
    const order = await p.order.create({ data: { orderNumber: `${tag}-ORD`, userId: learner.id, courseId: course.id, amount: 1000, discountAmount: 0, taxAmount: 0, totalAmount: 1000, currency: "BDT", status: "PAID", paidAt: new Date(), paymentMethod: "SSLCommerz" } });
    await p.invoice.create({ data: { invoiceNumber: `${tag}-INV`, orderId: order.id, userId: learner.id, courseId: course.id, amount: 1000, discountAmount: 0, taxAmount: 0, totalAmount: 1000, currency: "BDT", invoiceUrl: "https://example.com/inv.pdf" } });

    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${SITE}/?academy=${inst.slug}`, { waitUntil: "networkidle2", timeout: 90000 });
    const ok = await page.evaluate(async (e) => (await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: e, password: "Admin12345" }) })).ok, learner.email);
    check("learner signed in", ok);

    // ---------------------------------------------------------------- overview
    await page.goto(`${SITE}/dashboard`, { waitUntil: "networkidle2" });
    const t0 = await waitForText(page, "Continue learning").then(() => safeText(page));
    check("overview: welcome, stats, continue learning, upcoming live, recent quiz", t0.includes("Welcome back, Dash") && t0.includes("Lessons completed") && t0.includes(course.title) && t0.includes("Soon class") && t0.includes("Module quiz") && t0.includes("1 assignment waiting"));
    await page.screenshot({ path: `${SHOTS}/dash-1-overview.png` });

    // ---------------------------------------------------------------- live
    await page.goto(`${SITE}/dashboard?tab=live`, { waitUntil: "networkidle2" });
    await waitForText(page, "Soon class");
    const join = await page.$$eval("a", (as) => as.filter((a) => a.textContent?.trim() === "Join").map((a) => (a as HTMLAnchorElement).href));
    const t1 = await safeText(page);
    check("live: join link only for the class starting soon", join.length === 1 && join[0] === "https://meet.example.com/soon" && t1.includes("Later class") && t1.includes("Link opens 15 min before"));
    await page.reload({ waitUntil: "networkidle2" });
    check("?tab=live survives a reload", (await waitForText(page, "Soon class").then(() => safeText(page))).includes("Live classes"));
    await page.goto(`${SITE}/dashboard?tab=live&when=past`, { waitUntil: "networkidle2" });
    await waitForText(page, "Past class");
    check("past classes show the recording", (await page.$$eval("a", (as) => as.some((a) => (a as HTMLAnchorElement).href === "https://video.example.com/rec"))));

    // ---------------------------------------------------------------- assignments
    await page.goto(`${SITE}/dashboard?tab=assignments`, { waitUntil: "networkidle2" });
    await waitForText(page, "Write a summary");
    await hydrated(page);
    check("assignment instructions are sanitised", (await safeText(page)).includes("Summarise module 1") && !(await page.evaluate(() => (window as any).__x)));
    await page.type("textarea", "too short");
    await clickText(page, "Submit");
    await until(() => safeText(page), (t) => t.includes("Write at least a few sentences"));
    await page.$eval("textarea", (e) => (e as HTMLTextAreaElement).select());
    await page.type("textarea", "Module 1 covered variables, functions and the DOM with small projects.");
    await clickText(page, "Submit");
    const sub = await until(() => p.assignmentSubmission.findFirst({ where: { assignmentId: textAsg.id, userId: learner.id } }), (s: any) => !!s);
    check("text answer validated, then submitted", sub?.status === "PENDING" && sub.textAnswer?.startsWith("Module 1 covered"), sub?.textAnswer);
    await page.goto(`${SITE}/dashboard?tab=assignments&show=done`, { waitUntil: "networkidle2" });
    await waitForText(page, "Graded task");
    await clickText(page, "Graded task");
    const t2 = await until(() => safeText(page), (t) => t.includes("Nice work!"));
    check("submitted tab: graded marks + feedback", t2.includes("8 / 10 marks") && t2.includes("Write a summary"));

    // ---------------------------------------------------------------- quizzes / certificates / orders
    await page.goto(`${SITE}/dashboard?tab=quizzes`, { waitUntil: "networkidle2" });
    check("quiz results table", (await waitForText(page, "Module quiz").then(() => safeText(page))).includes("8/10"));
    await page.goto(`${SITE}/dashboard?tab=certificates`, { waitUntil: "networkidle2" });
    await waitForText(page, `${tag}-CERT`);
    check("certificate with verify link", await page.$$eval("a", (as, code) => as.some((a) => (a as HTMLAnchorElement).href.endsWith(`/${code}`)), `${tag}VERIFY`));
    await page.goto(`${SITE}/dashboard?tab=orders`, { waitUntil: "networkidle2" });
    const t3 = await waitForText(page, `${tag}-ORD`).then(() => safeText(page));
    check("orders: PAID with invoice PDF", t3.includes("Paid") && (await page.$$eval("a", (as) => as.some((a) => (a as HTMLAnchorElement).href === "https://example.com/inv.pdf"))));

    // ---------------------------------------------------------------- profile + password
    await page.goto(`${SITE}/dashboard?tab=profile`, { waitUntil: "networkidle2" });
    await page.waitForSelector("#profile-name");
    await hydrated(page);
    await page.$eval("#profile-name", (e) => (e as HTMLInputElement).select());
    await page.type("#profile-name", "Dashy Learner");
    await page.type("#profile-phone", "+8801711000000");
    await clickText(page, "Save changes");
    const u = await until(() => p.user.findUnique({ where: { id: learner.id } }), (x: any) => x?.name === "Dashy Learner");
    await page.reload({ waitUntil: "networkidle2" });
    check("profile saved; header shows the new name", u?.phone === "+8801711000000" && (await waitForText(page, "Dashy").then(() => safeText(page))).includes("Dashy"));
    await page.type("#pw-current", "Admin12345");
    await page.type("#pw-new", "NewPassw0rd!");
    await page.type("#pw-confirm", "NewPassw0rd!x");
    await clickText(page, "Change password");
    await until(() => safeText(page), (t) => t.includes("Passwords don't match"));
    await page.$eval("#pw-confirm", (e) => (e as HTMLInputElement).select());
    await page.type("#pw-confirm", "NewPassw0rd!");
    await clickText(page, "Change password");
    await waitForText(page, "Password changed");
    const oldLogin = await fetch(`${API}/academy/public/${inst.slug}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: learner.email, password: "Admin12345" }) });
    const newLogin = await fetch(`${API}/academy/public/${inst.slug}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: learner.email, password: "NewPassw0rd!" }) });
    check("password changed: old one refused, new one works", oldLogin.status === 401 && newLogin.status === 200);

    // ---------------------------------------------------------------- old address
    await page.goto(`${SITE}/my-courses`, { waitUntil: "networkidle2" });
    await until(async () => page.url(), (x) => x.includes("/dashboard?tab=courses"));
    check("/my-courses → dashboard courses tab", page.url().includes("/dashboard?tab=courses") && (await waitForText(page, course.title).then(() => true)));
    await page.screenshot({ path: `${SHOTS}/dash-2-courses.png` });
  } catch (err) {
    check("suite crashed", false, (err as Error).stack);
    for (const [i, pg] of (await browser.pages()).entries()) await pg.screenshot({ path: `${SHOTS}/dash-fail-${i}.png` }).catch(() => {});
  } finally {
    await browser.close();
    await cleanup(ids, tag, async (courses) => {
      const orders = (await p.order.findMany({ where: { courseId: { in: courses } }, select: { id: true } })).map((o: any) => o.id);
      await retry(() => p.invoice.deleteMany({ where: { orderId: { in: orders } } }));
      await retry(() => p.order.deleteMany({ where: { id: { in: orders } } }));
      await retry(() => p.certificate.deleteMany({ where: { courseId: { in: courses } } }));
      await retry(() => p.quizAttempt.deleteMany({ where: { quiz: { courseId: { in: courses } } } }));
      await retry(() => p.quiz.deleteMany({ where: { courseId: { in: courses } } }));
      await retry(() => p.assignmentSubmission.deleteMany({ where: { assignment: { courseId: { in: courses } } } }));
      await retry(() => p.assignment.deleteMany({ where: { courseId: { in: courses } } }));
      await retry(() => p.liveClass.deleteMany({ where: { courseId: { in: courses } } }));
    });
    await report(tag);
  }
})();
