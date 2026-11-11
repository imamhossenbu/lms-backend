/**
 * API test of learner accounts + course checkout for academy websites (/academy/public/:slug/auth/*,
 * /academy/:slug/me/*, /academy/checkout/sslcommerz/*): sign-up with an emailed code (wrong code refused,
 * re-sign-up of an unfinished account allowed), sign-in only for this academy's learners, free course → enrolled,
 * coupon quote errors / discount, 100% coupon → paid without the gateway (coupon counted once), paid course →
 * real SSLCommerz sandbox session, cancel callback → 303 to the academy site + CANCELLED, forged success callback
 * never pays, other learners can't read the order, forgot / reset password with an emailed code. Own workspaces; cleanup in `finally`.
 */
import { check, cleanup, mkCourse, mkInstitution, mkUser, newTag, prisma as p, report, retry, type Ids } from "./panel-e2e-helpers";

const API = process.env.LIVE_API_URL ?? "http://localhost:4077";
const tag = newTag();
const ids: Ids = { users: [], insts: [] };

const call = async (method: string, path: string, body?: unknown, token?: string) => {
  const res = await fetch(`${API}${path}`, {
    method,
    redirect: "manual",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data: data as any };
};
const form = (path: string, body: Record<string, string>) =>
  fetch(`${API}${path}`, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body).toString() });

(async () => {
  try {
    const inst = await mkInstitution(ids, `${tag}-a`);
    const other = await mkInstitution(ids, `${tag}-b`);
    const teacher = await mkUser(ids, tag, "Teacher", "TEACHER", inst.id);
    const admin = await mkUser(ids, tag, "Admin", "ADMIN", inst.id);
    const free = await mkCourse(inst.id, `${tag} Free`, teacher.id);
    const paid = await mkCourse(inst.id, `${tag} Paid`, teacher.id, free.categoryId);
    await p.course.update({ where: { id: paid.id }, data: { price: 1000, isFree: false } });
    const now = Date.now();
    const coupon = (code: string, type: string, value: number) =>
      p.coupon.create({ data: { code, institutionId: inst.id, discountType: type, discountTypeValue: value, courseId: paid.id, maxUses: 5, startDate: new Date(now - 864e5), endDate: new Date(now + 864e5), status: "ACTIVE" } });
    await coupon(`${tag}OFF20`.toUpperCase(), "PERCENTAGE", 20);
    const full = await coupon(`${tag}FULL`.toUpperCase(), "PERCENTAGE", 100);
    await p.coupon.create({ data: { code: `${tag}OLD`.toUpperCase(), institutionId: inst.id, discountType: "FIXED", discountTypeValue: 100, courseId: paid.id, maxUses: 5, startDate: new Date(now - 3 * 864e5), endDate: new Date(now - 864e5), status: "ACTIVE" } });

    const A = `/academy/public/${inst.slug}/auth`;
    const email = `${tag}-learner@example.com`;

    // ---------------------------------------------------------------- sign-up
    const bad = await call("POST", `${A}/register`, { name: "L", email: "nope", password: "1" });
    check("register validates name / email / password", bad.status === 400 && bad.data.message.length >= 3, bad.data);
    const reg = await call("POST", `${A}/register`, { name: "Learner One", email, password: "Passw0rd!x" });
    const row = await p.user.findUnique({ where: { email } });
    ids.users.push(row.id);
    check("register → PENDING student of this academy with a code", reg.status === 201 && row.role === "STUDENT" && row.institutionId === inst.id && row.status === "PENDING" && /^\d{6}$/.test(row.verificationToken ?? ""), reg.data);
    const again = await call("POST", `${A}/register`, { name: "Learner Uno", email, password: "Passw0rd!y" });
    const row2 = await p.user.findUnique({ where: { email } });
    check("unfinished sign-up can be restarted (new code, new name)", again.status === 201 && row2.name === "Learner Uno" && row2.verificationToken !== row.verificationToken, again.data);
    const early = await call("POST", `${A}/login`, { email, password: "Passw0rd!y" });
    check("sign-in before confirming → EMAIL_NOT_VERIFIED", early.status === 401 && early.data.code === "EMAIL_NOT_VERIFIED", early.data);
    const wrong = await call("POST", `${A}/verify`, { email, code: row2.verificationToken === "000000" ? "111111" : "000000" });
    check("wrong code refused", wrong.status === 400, wrong.data);
    const ver = await call("POST", `${A}/verify`, { email, code: row2.verificationToken });
    check("right code → signed in", ver.status === 200 && typeof ver.data.token === "string" && ver.data.user.email === email, ver.data);
    const dup = await call("POST", `${A}/register`, { name: "Learner Again", email, password: "Passw0rd!x" });
    check("finished account can't sign up again (409)", dup.status === 409, dup.data);

    // ---------------------------------------------------------------- sign-in
    const li = await call("POST", `${A}/login`, { email, password: "Passw0rd!y" });
    check("learner signs in", li.status === 200 && !!li.data.token, li.data);
    const token: string = li.data.token;
    const staff = await call("POST", `${A}/login`, { email: admin.email, password: "Admin12345" });
    check("staff can't sign in on the academy site", staff.status === 401, staff.data);
    const elsewhere = await call("POST", `/academy/public/${other.slug}/auth/login`, { email, password: "Passw0rd!y" });
    check("learner can't sign in to another academy", elsewhere.status === 401, elsewhere.data);
    const me = await call("GET", `/academy/${inst.slug}/me`, undefined, token);
    const meOther = await call("GET", `/academy/${other.slug}/me`, undefined, token);
    check("me works here, 401 in another academy", me.status === 200 && me.data.email === email && meOther.status === 401, { me: me.data, meOther: meOther.data });
    const anon = await call("GET", `/academy/${inst.slug}/me`);
    check("me needs a token", anon.status === 401);

    // ---------------------------------------------------------------- free course
    const M = `/academy/${inst.slug}/me`;
    const fq = await call("GET", `${M}/checkout/${free.slug}`, undefined, token);
    check("free course quote = 0, not enrolled", fq.status === 200 && fq.data.total === 0 && fq.data.course.isFree && !fq.data.enrolled, fq.data);
    const fs = await call("POST", `${M}/checkout`, { courseSlug: free.slug }, token);
    const acc = await call("GET", `${M}/courses/${free.slug}/access`, undefined, token);
    check("free course → ENROLLED straight away", fs.status === 201 && fs.data.status === "ENROLLED" && acc.data.enrolled === true, { fs: fs.data, acc: acc.data });
    const fs2 = await call("POST", `${M}/checkout`, { courseSlug: free.slug }, token);
    check("enrolling twice → 409", fs2.status === 409, fs2.data);

    // ---------------------------------------------------------------- coupons
    const q0 = await call("GET", `${M}/checkout/${paid.slug}`, undefined, token);
    check("paid quote in the workspace currency", q0.data.price === 1000 && q0.data.total === 1000 && q0.data.currency === "BDT", q0.data);
    const qBad = await call("GET", `${M}/checkout/${paid.slug}?coupon=nope`, undefined, token);
    const qOld = await call("GET", `${M}/checkout/${paid.slug}?coupon=${tag}old`, undefined, token);
    check("unknown / expired coupon → couponError, full price", qBad.data.couponError && qOld.data.couponError?.includes("expired") && qOld.data.total === 1000, { qBad: qBad.data.couponError, qOld: qOld.data.couponError });
    const q20 = await call("GET", `${M}/checkout/${paid.slug}?coupon=${tag}off20`, undefined, token);
    check("20% coupon → 800", q20.data.discount === 200 && q20.data.total === 800 && q20.data.coupon?.label === "20% off", q20.data);
    const sBad = await call("POST", `${M}/checkout`, { courseSlug: paid.slug, coupon: "nope" }, token);
    check("start with a bad coupon → 400", sBad.status === 400, sBad.data);

    // ---------------------------------------------------------------- paid course → sandbox
    const s = await call("POST", `${M}/checkout`, { courseSlug: paid.slug, coupon: `${tag}off20` }, token);
    const o1 = s.data?.orderId ? await p.order.findUnique({ where: { id: s.data.orderId } }) : null;
    check("paid course → REDIRECT to the SSLCommerz sandbox, PENDING order for 800", s.status === 201 && s.data.status === "REDIRECT" && /sslcommerz\.com/.test(s.data.gatewayUrl) && o1?.status === "PENDING" && Number(o1.totalAmount) === 800 && o1.referralSource === "Academy website", s.data);
    const forged = await form("/academy/checkout/sslcommerz/success", { tran_id: o1.orderNumber, val_id: "forged-123", status: "VALID", amount: "800" });
    const afterForged = await p.order.findUnique({ where: { id: o1.id } });
    check("forged success callback → 303 to the site, order NOT paid", forged.status === 303 && (forged.headers.get("location") ?? "").includes(`/checkout/result?order=${o1.id}`) && afterForged.status === "PENDING", forged.headers.get("location"));
    const cancel = await form("/academy/checkout/sslcommerz/cancel", { tran_id: o1.orderNumber });
    const r1 = await call("GET", `${M}/orders/${o1.id}`, undefined, token);
    check("cancel callback → 303 + CANCELLED result", cancel.status === 303 && r1.data.status === "CANCELLED" && r1.data.course.slug === paid.slug, r1.data);
    const couponAfterCancel = await p.coupon.findFirst({ where: { code: `${tag}OFF20`.toUpperCase() } });
    check("unpaid order doesn't use up the coupon", couponAfterCancel.usedCount === 0);

    // ---------------------------------------------------------------- 100% coupon
    const sf = await call("POST", `${M}/checkout`, { courseSlug: paid.slug, coupon: `${tag}full` }, token);
    const of = sf.data?.orderId ? await p.order.findUnique({ where: { id: sf.data.orderId } }) : null;
    const fullAfter = await p.coupon.findUnique({ where: { id: full.id } });
    const enr = await p.enrollment.findFirst({ where: { userId: row.id, courseId: paid.id } });
    check("100% coupon → ENROLLED, PAID order of 0, coupon counted once", sf.data?.status === "ENROLLED" && of?.status === "PAID" && Number(of.totalAmount) === 0 && fullAfter.usedCount === 1 && !!enr, sf.data);
    const rf = await call("GET", `${M}/orders/${of.id}`, undefined, token);
    check("result shows PAID", rf.data.status === "PAID", rf.data);

    // ---------------------------------------------------------------- isolation
    const other2 = await call("POST", `${A}/register`, { name: "Learner Two", email: `${tag}-two@example.com`, password: "Passw0rd!x" });
    const u2 = await p.user.findUnique({ where: { email: `${tag}-two@example.com` } });
    ids.users.push(u2.id);
    const v2 = await call("POST", `${A}/verify`, { email: u2.email, code: u2.verificationToken });
    const peek = await call("GET", `${M}/orders/${of.id}`, undefined, v2.data.token);
    check("another learner can't read the order (404)", other2.status === 201 && peek.status === 404, peek.data);

    // ---------------------------------------------------------------- forgot / reset password
    const fg = await call("POST", `${A}/forgot`, { email });
    const unknown = await call("POST", `${A}/forgot`, { email: `${tag}-nobody@example.com` });
    const tokenRow = await p.user.findUnique({ where: { email }, select: { verificationToken: true } });
    const resetCode = (tokenRow?.verificationToken ?? "").split(":")[1];
    check("forgot: same answer for known / unknown emails, code stored with expiry", fg.status === 200 && unknown.status === 200 && fg.data.message === unknown.data.message && /^\d{6}$/.test(resetCode ?? ""), tokenRow?.verificationToken);
    const wrongCode = await call("POST", `${A}/reset`, { email, code: resetCode === "000000" ? "111111" : "000000", newPassword: "Brandnew!234" });
    const weak = await call("POST", `${A}/reset`, { email, code: resetCode, newPassword: "short" });
    check("reset: wrong code → 400, weak password → 400", wrongCode.status === 400 && weak.status === 400, { wrongCode: wrongCode.data, weak: weak.data });
    const okReset = await call("POST", `${A}/reset`, { email, code: resetCode, newPassword: "Brandnew!234" });
    const reuse = await call("POST", `${A}/reset`, { email, code: resetCode, newPassword: "Another!234" });
    const oldPw = await call("POST", `${A}/login`, { email, password: "Passw0rd!y" });
    const newPw = await call("POST", `${A}/login`, { email, password: "Brandnew!234" });
    check("reset with the right code: new password works, old fails, code can't be reused", okReset.status === 200 && reuse.status === 400 && oldPw.status === 401 && newPw.status === 200, [okReset.status, reuse.status, oldPw.status, newPw.status]);
  } catch (err) {
    check("suite crashed", false, (err as Error).stack);
  } finally {
    await cleanup(ids, tag, async (courses) => {
      const orders = (await p.order.findMany({ where: { courseId: { in: courses } }, select: { id: true } })).map((o: any) => o.id);
      await retry(() => p.couponUsage.deleteMany({ where: { orderId: { in: orders } } }));
      await retry(() => p.payment.deleteMany({ where: { orderId: { in: orders } } }));
      await retry(() => p.orderEvent.deleteMany({ where: { orderId: { in: orders } } }));
      await retry(() => p.invoice?.deleteMany?.({ where: { orderId: { in: orders } } }));
      await retry(() => p.order.deleteMany({ where: { id: { in: orders } } }));
      await retry(() => p.coupon.deleteMany({ where: { institutionId: { in: ids.insts } } }));
    });
    await report(tag);
  }
})();
