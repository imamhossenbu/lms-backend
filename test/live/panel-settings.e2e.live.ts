/**
 * Browser E2E for the admin panel Settings against the real API: General save (+ validation, reload, audit),
 * `?section=` kept across reloads, Payments gateway with a write-only secret (encrypted at rest, only the masked
 * hint comes back), the gateway "Test connection" endpoint, isolation from another workspace and the admin idle
 * session timeout (sent to the sign-in page with the reason).
 * Panel on :3010, API on :4077 by default. Cleanup in `finally`.
 */
import { PANEL, SHOTS, check, cleanup, dumpPages, fill, launch, login, mkInstitution, mkUser, newTag, prisma as p, realClick, report, result, sleep, text, until, waitForText, type Ids } from "./panel-e2e-helpers";

const tag = newTag();
const row = (institutionId: string) => p.workspaceSettings.findFirst({ where: { institutionId } });

(async () => {
  const ids: Ids = { users: [], insts: [] };
  const browser = await launch();
  try {
    const inst = await mkInstitution(ids, tag);
    const other = await mkInstitution(ids, `${tag}-other`);
    const admin = await mkUser(ids, tag, "Settings Admin", "ADMIN", inst.id);
    const otherAdmin = await mkUser(ids, tag, "Other Admin", "ADMIN", other.id);

    const { ctx, page } = await login(browser, admin.email);

    // ---------------------------------------------------------------- 1. general: validation
    await page.goto(`${PANEL}/settings`, { waitUntil: "networkidle2" });
    await page.waitForSelector("#general-platform-name", { timeout: 30000 });
    await page.screenshot({ path: `${SHOTS}/set-1-general.png` });
    await fill(page, "#general-platform-name", "");
    await realClick(page, "button", "Save changes");
    await waitForText(page, "Please fix the highlighted fields");
    check("empty platform name is refused and nothing is saved", !(await row(inst.id))?.general);

    // ---------------------------------------------------------------- 2. general: save + reload + audit
    const name = `Academy ${tag}`;
    await fill(page, "#general-platform-name", name);
    await fill(page, "#general-tagline", "Learn from the browser test");
    await realClick(page, "button", "Save changes");
    const saved = await until(() => row(inst.id), (r: any) => r?.general?.platformName === name);
    check("general section saved via the API", saved?.general?.platformName === name && saved?.general?.tagline === "Learn from the browser test", saved?.general);
    check("the save wrote an audit entry", Array.isArray(saved?.audit) && saved.audit.some((a: any) => a.section === "general"), saved?.audit);
    await waitForText(page, "Settings saved");
    await page.reload({ waitUntil: "networkidle2" });
    await page.waitForSelector("#general-platform-name");
    const afterReload = await until(() => page.$eval("#general-platform-name", (e) => (e as HTMLInputElement).value), (v) => v === name);
    check("saved name is read back after a reload", afterReload === name, afterReload);

    // ---------------------------------------------------------------- 3. payments: section survives reload
    await page.goto(`${PANEL}/settings?section=payments`, { waitUntil: "networkidle2" });
    await page.waitForSelector("#payments-stripe-public-key", { timeout: 30000 });
    await page.reload({ waitUntil: "networkidle2" });
    await page.waitForSelector("#payments-stripe-secret", { timeout: 30000 });
    check("?section=payments stays open after a reload", (await text(page)).includes("Stripe") && !!(await page.$("#payments-stripe-secret")));

    // ---------------------------------------------------------------- 4. payments: secret is write-only
    const publicSel = "#payments-stripe-public-key";
    const enabled = await page.$eval("#payments-stripe-enabled", (e) => e.getAttribute("aria-checked") === "true" || (e as HTMLInputElement).checked === true);
    if (!enabled) await page.click("#payments-stripe-enabled");
    await fill(page, publicSel, "pk_test_e2e12345");
    const secret = `sk_test_${tag}9z8y`;
    await fill(page, "#payments-stripe-secret", secret);
    await realClick(page, "button", "Save changes");
    const pay = await until(() => row(inst.id), (r: any) => !!r?.secrets?.["payments.stripe.secretKey"]);
    const stored = pay?.secrets?.["payments.stripe.secretKey"];
    check("stripe settings saved via the API", pay?.payments?.stripe?.enabled === true && pay?.payments?.stripe?.publicKey === "pk_test_e2e12345", pay?.payments?.stripe);
    check("secret is stored encrypted, not in the section JSON", !!stored && !JSON.stringify(stored).includes(secret) && !JSON.stringify(pay.payments).includes(secret), stored);
    await waitForText(page, "Settings saved");
    await page.reload({ waitUntil: "networkidle2" });
    await page.waitForSelector("#payments-stripe-secret");
    await waitForText(page, "9z8y");
    const t4 = await text(page);
    const secretValue = await page.$eval("#payments-stripe-secret", (e) => (e as HTMLInputElement).value);
    check("only the masked hint comes back", !t4.includes(secret) && secretValue === "", { secretValue });
    await page.screenshot({ path: `${SHOTS}/set-2-payments.png` });

    // ---------------------------------------------------------------- 5. gateway test endpoint
    const testButtons = await page.$$eval("button", (bs) => bs.filter((b) => b.innerText.includes("Test connection")).length);
    await page.evaluate(() => {
      // The "Test connection" button of the Stripe card: the closest one after the secret input.
      const input = document.querySelector("#payments-stripe-secret")!;
      const all = [...document.querySelectorAll<HTMLButtonElement>("button")].filter((b) => b.innerText.includes("Test connection"));
      const after = all.find((b) => input.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      after?.setAttribute("data-e2e", "stripe-test");
    });
    await page.click('button[data-e2e="stripe-test"]');
    await waitForText(page, "Stripe is set up");
    check("Test connection checks the saved gateway via the API", testButtons >= 1);

    // ---------------------------------------------------------------- 6. isolation
    const o = await login(browser, otherAdmin.email);
    await o.page.goto(`${PANEL}/settings`, { waitUntil: "networkidle2" });
    await o.page.waitForSelector("#general-platform-name", { timeout: 30000 });
    await sleep(800);
    const otherName = await o.page.$eval("#general-platform-name", (e) => (e as HTMLInputElement).value);
    check("another workspace doesn't see these settings", otherName !== name && !(await row(other.id))?.general, otherName);
    await o.page.goto(`${PANEL}/settings?section=payments`, { waitUntil: "networkidle2" });
    await o.page.waitForSelector("#payments-stripe-secret");
    await sleep(800);
    check("another workspace doesn't get the secret hint", !(await text(o.page)).includes("9z8y"));
    await o.ctx.close();

    // ---------------------------------------------------------------- 7. idle session timeout → sign-in page
    // Activity is recorded at most once a minute; the open page's background inbox refresh (every 60 s) or the
    // next navigation then hits the timeout and the panel sends the admin to the sign-in page with the reason.
    await page.goto(`${PANEL}/settings`, { waitUntil: "networkidle2" });
    await p.user.update({ where: { id: admin.id }, data: { lastActiveAt: new Date(Date.now() - 200 * 60_000) } });
    const signedOut = await page
      .waitForFunction(() => location.pathname === "/login" && document.body.innerText.includes("You were signed out"), { timeout: 150_000, polling: 500 })
      .then(() => true)
      .catch(() => false);
    const tIdle = await text(page);
    check("an idle admin is sent to the sign-in page with the reason", signedOut && tIdle.includes("inactivity"), { url: page.url(), t: tIdle.slice(0, 200) });
    await page.screenshot({ path: `${SHOTS}/set-3-idle.png` });
    await ctx.close();
  } catch (e) {
    console.log("FAIL exception", (e as Error).message || String(e).slice(0, 400));
    result.bad++;
    await dumpPages(browser, "set");
  } finally {
    await browser.close();
    await cleanup(ids, tag, async () => {
      await p.workspaceSettings.deleteMany({ where: { institutionId: { in: ids.insts } } });
    });
    await report(tag, `, (select count(*)::int from workspace_settings where "institutionId" in (${ids.insts.map((i) => `'${i}'`).join(",") || "''"})) settings`);
  }
})();
