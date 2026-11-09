/**
 * Browser E2E for the website checkout (lms-website /checkout) against the real API and the SSLCommerz SANDBOX:
 * plans + live tax quote, zod validation, cycle in the URL, subdomain availability, start → sandbox payment page
 * (password stored only as a bcrypt hash), sandbox card + OTP → validated success callback → ACTIVE academy with a
 * PENDING admin and a PAID invoice → result page; a forged success callback and a cancel never create an academy.
 * Needs SSL_STORE_ID / SSL_STORE_PASSWORD (sandbox) in the API's .env. Website on :3002. Cleanup in `finally`.
 */
import type { Page } from "puppeteer-core";
import { SHOTS, check, launch, newTag, prisma as p, result, retry, sleep, text, until, waitForText } from "./panel-e2e-helpers";

const SITE = process.env.LIVE_WEBSITE_URL ?? "http://localhost:3002";
const API = process.env.LIVE_API_URL ?? "http://localhost:4077";
const tag = newTag();
/** Page text that tolerates the gateway navigating mid-read. */
const safeText = (page: Page) => text(page).catch(() => "");
const email = `${tag}@example.com`;
const form = (body: Record<string, string>) => ({ method: "POST", redirect: "manual" as const, headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body).toString() });
const startViaApi = (suffix: string) =>
  fetch(`${API}/saas/public/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planId: "starter", cycle: "MONTHLY", institutionName: `E2E ${suffix}`, type: "COACHING", slug: `${tag}-${suffix}`, country: "Bangladesh", name: "E2E Tester", email: `${tag}.${suffix}@example.com`, phone: "+8801711000000", password: "Passw0rd!x", agreeTerms: true }),
  }).then((r) => r.json() as Promise<{ reference: string; gatewayUrl: string }>);

(async () => {
  const browser = await launch();
  try {
    const page = await (await browser.createBrowserContext()).newPage();
    await page.setViewport({ width: 1280, height: 900 });

    // ---------------------------------------------------------------- page + quote
    const quote = await (await fetch(`${API}/saas/public/checkout/quote?planId=growth&cycle=MONTHLY&country=Bangladesh`)).json();
    await page.goto(`${SITE}/checkout?plan=growth&cycle=MONTHLY`, { waitUntil: "networkidle2" });
    await waitForText(page, "Due today");
    const t0 = await until(() => text(page), (t) => t.includes(`$${quote.total}`));
    check("checkout lists the plans and the live quote (price + tax)", ["Starter", "Growth", "Pro"].every((n) => t0.includes(n)) && t0.includes(`$${quote.tax}`) && t0.includes(`Pay $${quote.total} securely`), quote);

    await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Yearly")?.click());
    await until(() => page.url(), (u) => u.includes("cycle=YEARLY"));
    const yq = await (await fetch(`${API}/saas/public/checkout/quote?planId=growth&cycle=YEARLY&country=Bangladesh`)).json();
    const t1 = await until(() => text(page), (t) => t.includes(`$${yq.total}`));
    check("Yearly toggle goes into the URL and re-prices", t1.includes(`$${yq.total}`), yq.total);
    await page.reload({ waitUntil: "networkidle2" });
    check("cycle survives a reload", (await until(() => text(page), (t) => t.includes(`$${yq.total}`))).includes(`$${yq.total}`));

    // ---------------------------------------------------------------- validation + subdomain
    await page.goto(`${SITE}/checkout?plan=starter&cycle=MONTHLY`, { waitUntil: "networkidle0" });
    await waitForText(page, "securely"); // hydrated + quoted
    await page.click("button[type=submit]");
    const t2 = await until(() => text(page), (t) => t.includes("Please accept the Terms"));
    check("empty submit shows field errors", ["Enter your academy's name", "Enter your name", "Enter a valid email address", "Enter a valid phone number", "At least 8 characters"].every((m) => t2.includes(m)));

    const type = async (name: string, value: string) => {
      await page.click(`[name=${name}]`, { clickCount: 3 });
      await page.type(`[name=${name}]`, value);
    };
    const taken = (await p.institution.findFirst({ select: { slug: true } }))?.slug;
    if (taken) {
      await type("slug", taken);
      check("a taken subdomain is flagged", (await until(() => page.$('[aria-label="Taken"]'), (el) => !!el)) !== null);
    }
    await type("institutionName", `E2E Checkout ${tag}`);
    await type("slug", tag);
    check("a free subdomain is confirmed", (await until(() => text(page), (t) => t.includes(`${tag}.edupro.com is available`))).includes("is available"));
    await type("name", "E2E Tester");
    await type("email", email);
    await type("phone", "+8801711000000");
    await type("password", "Passw0rd!x");
    await page.click("input[type=checkbox]");

    // ---------------------------------------------------------------- start → SSLCommerz sandbox
    await Promise.all([page.waitForNavigation({ timeout: 60000 }), page.click("button[type=submit]")]);
    check("Pay opens the SSLCommerz sandbox page", page.url().startsWith("https://sandbox.sslcommerz.com/"), page.url());
    const pending = await p.saasCheckout.findFirst({ where: { email } });
    check("a PENDING checkout is saved with a bcrypt hash only", pending?.status === "PENDING" && pending.passwordHash.startsWith("$2") && !JSON.stringify(pending).includes("Passw0rd"), pending?.status);

    // Sandbox test card 4111 1111 1111 1111 + OTP 111111.
    await page.waitForSelector('input[placeholder="Enter Card Number"]', { timeout: 30000 });
    for (const [ph, v] of [["Enter Card Number", "4111111111111111"], ["MM/YY", "1230"], ["CVC/CVV", "111"], ["Card Holder Name", "E2E Tester"]]) await page.type(`input[placeholder="${ph}"]`, v, { delay: 30 });
    await sleep(600);
    const pay = await page.evaluateHandle(() => [...document.querySelectorAll("button,a,div")].find((e) => /^PAY /i.test((e.textContent || "").trim()) && (e as HTMLElement).offsetParent && e.children.length < 4));
    await (pay as any).click();
    await until(() => safeText(page), (t) => t.includes("OTP"), 40);
    await page.type("input[type=text],input[type=password],input:not([type])", "111111");
    await Promise.all([page.waitForNavigation({ timeout: 60000 }).catch(() => null), page.evaluate(() => ([...document.querySelectorAll("input[type=submit],button")].find((e) => (e as HTMLElement).offsetParent) as HTMLElement)?.click())]);
    await until(async () => page.url(), (u) => u.startsWith(`${SITE}/checkout/result`), 40);
    const t3 = await until(() => safeText(page), (t) => t.includes("your academy is ready"));
    check("after paying, the result page says the academy is ready", t3.includes("your academy is ready") && t3.includes(`${tag}.edupro.com`), page.url());
    await page.screenshot({ path: `${SHOTS}/checkout-paid.png` });

    const paid = await p.saasCheckout.findFirst({ where: { email } });
    const inst = paid?.institutionId ? await p.institution.findUnique({ where: { id: paid.institutionId } }) : null;
    const admin = await p.user.findFirst({ where: { email } });
    const invoice = inst ? await p.saasInvoice.findFirst({ where: { institutionId: inst.id } }) : null;
    check("checkout PAID with gateway ids", paid?.status === "PAID" && !!paid.valId && !!paid.bankTranId, paid?.status);
    check("academy ACTIVE on the bought plan (no trial)", inst?.status === "ACTIVE" && inst.planId === "starter" && inst.slug === tag, inst?.status);
    check("owner admin created PENDING until email is verified, with the chosen password hash", admin?.status === "PENDING" && admin.institutionId === inst?.id && admin.password === paid?.passwordHash);
    check("first invoice is PAID for the plan price", invoice?.status === "PAID" && Math.abs(Number(invoice.amount) - (paid?.subtotal ?? -1)) < 0.01, invoice?.status);
    const again = await fetch(`${API}/saas/public/checkout/sslcommerz/success`, form({ tran_id: paid!.tranId, val_id: paid!.valId }));
    check("a repeated success callback is idempotent (one academy)", again.status === 303 && (await p.institution.count({ where: { slug: tag } })) === 1);

    // ---------------------------------------------------------------- forged success + cancel
    const forged = await startViaApi("forged");
    const r1 = await fetch(`${API}/saas/public/checkout/sslcommerz/success`, form({ tran_id: forged.reference, val_id: "fake-val-id" }));
    const f = await p.saasCheckout.findUnique({ where: { tranId: forged.reference } });
    check("a forged success callback fails and creates no academy", r1.status === 303 && f?.status === "FAILED" && !f.institutionId && (await p.institution.count({ where: { slug: `${tag}-forged` } })) === 0, f?.status);

    const cancelled = await startViaApi("cancel");
    const r2 = await fetch(`${API}/saas/public/checkout/sslcommerz/cancel`, form({ tran_id: cancelled.reference }));
    await page.goto(r2.headers.get("location") ?? `${SITE}/checkout/result?ref=${cancelled.reference}`, { waitUntil: "networkidle2" });
    check("cancel → CANCELLED and the result page says so", (await p.saasCheckout.findUnique({ where: { tranId: cancelled.reference } }))?.status === "CANCELLED" && (await text(page)).includes("Payment cancelled"));
  } catch (e) {
    console.log("FAIL exception", (e as Error).message);
    result.bad++;
    for (const [i, pg] of (await browser.pages()).entries()) await pg.screenshot({ path: `${SHOTS}/checkout-fail-${i}.png` }).catch(() => {});
  } finally {
    await browser.close();
    await cleanupCheckouts(tag);
    const left = await p.$queryRawUnsafe(`select (select count(*)::int from saas_checkouts where email like '${tag}%') checkouts, (select count(*)::int from institutions where slug like '${tag}%') insts`);
    console.log(`\n${result.ok} passed, ${result.bad} failed | leftovers ${JSON.stringify(left)}`);
    await p.$disconnect();
  }
})();

/** Deletes checkouts whose email starts with `prefix` and every academy (with its admin) they created. */
export async function cleanupCheckouts(prefix: string) {
  const rows = await p.saasCheckout.findMany({ where: { email: { startsWith: prefix } }, select: { institutionId: true, email: true } });
  const insts = { in: rows.map((r: any) => r.institutionId).filter(Boolean) as string[] };
  for (const t of ["saasCouponRedemption", "saasInvoice", "saasEvent", "customDomain", "teamEvent", "teamMember", "teamRole", "workspaceSettings"]) await retry(() => p[t].deleteMany({ where: { institutionId: insts } }));
  await retry(() => p.user.deleteMany({ where: { OR: [{ institutionId: insts }, { email: { in: rows.map((r: any) => r.email) } }] } }));
  await retry(() => p.institution.deleteMany({ where: { id: insts } }));
  await retry(() => p.saasCheckout.deleteMany({ where: { email: { startsWith: prefix } } }));
}
