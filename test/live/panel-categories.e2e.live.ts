/**
 * Browser E2E for the admin panel Categories against the real API: list from the API (no mock categories) with
 * course counts, zod validation, create in the drawer (slug follows the name), edit, delete refused while courses
 * use the category, delete of an empty one, URL-kept drawer across reload and workspace isolation.
 * Panel on :3010, API on :4077 by default. Cleanup in `finally`.
 */
import { PANEL, SHOTS, check, cleanup, dumpPages, fill, launch, login, mkCourse, mkInstitution, mkUser, newTag, prisma as p, realClick, report, result, sleep, text, until, waitForNoText, waitForText, type Ids } from "./panel-e2e-helpers";

const tag = newTag();

(async () => {
  const ids: Ids = { users: [], insts: [] };
  const browser = await launch();
  try {
    const inst = await mkInstitution(ids, tag);
    const other = await mkInstitution(ids, `${tag}-other`);
    const admin = await mkUser(ids, tag, "Cat Admin", "ADMIN", inst.id);
    const otherAdmin = await mkUser(ids, tag, "Other Admin", "ADMIN", other.id);
    const used = await p.category.create({ data: { name: `Used Cat ${tag}`, slug: `used-${tag}`, description: "Has courses", icon: "code", status: "ACTIVE", institutionId: inst.id } });
    await mkCourse(inst.id, `Cat Course ${tag}`, admin.id, used.id);
    const foreign = await p.category.create({ data: { name: `Foreign Cat ${tag}`, slug: `foreign-${tag}`, status: "ACTIVE", institutionId: other.id } });
    void otherAdmin;

    const { ctx, page } = await login(browser, admin.email);

    // ---------------------------------------------------------------- 1. list
    await page.goto(`${PANEL}/categories`, { waitUntil: "networkidle2" });
    await waitForText(page, `Used Cat ${tag}`);
    const t0 = await text(page);
    check("list loads from the API (no mock categories)", !t0.includes("Mobile App Development") && !t0.includes("Cloud & DevOps"), t0.slice(0, 300));
    check("another workspace's category isn't listed", !t0.includes(`Foreign Cat ${tag}`));
    await page.screenshot({ path: `${SHOTS}/cat-1-list.png` });

    // ---------------------------------------------------------------- 2. validation
    await realClick(page, "button", "Add Category");
    await page.waitForSelector("#cat-name");
    await realClick(page, 'button[type="submit"]', "Create Category");
    await sleep(600);
    const errs = await page.$$eval("form#category-drawer-form p.text-red", (ps) => ps.map((x) => (x as HTMLElement).innerText));
    check("empty form shows field errors and saves nothing", errs.length > 0 && (await p.category.count({ where: { institutionId: inst.id } })) === 1, errs);

    // ---------------------------------------------------------------- 3. create
    const name = `New Cat ${tag}`;
    await fill(page, "#cat-name", name);
    await sleep(200);
    const slug = await page.$eval("#cat-slug", (e) => (e as HTMLInputElement).value);
    check("slug follows the name", slug === name.toLowerCase().replace(/\s+/g, "-"), slug);
    await fill(page, "#cat-desc", "Created from the browser");
    await realClick(page, 'button[type="submit"]', "Create Category");
    const created = await until(() => p.category.findFirst({ where: { institutionId: inst.id, name } }), (c: any) => !!c);
    check("create saved the category via the API", !!created && created.slug === slug && created.description === "Created from the browser" && created.status === "ACTIVE", created);
    await waitForText(page, "Category created");

    // ---------------------------------------------------------------- 4. edit (+ reload keeps the drawer)
    await page.goto(`${PANEL}/categories?drawer=${created.id}&mode=edit`, { waitUntil: "networkidle2" });
    await page.waitForSelector("#cat-name");
    await page.reload({ waitUntil: "networkidle2" });
    await page.waitForSelector("#cat-name");
    await until(() => page.$eval("#cat-name", (e) => (e as HTMLInputElement).value), (v) => v === name);
    check("edit drawer survives a reload with the saved values", (await page.$eval("#cat-name", (e) => (e as HTMLInputElement).value)) === name);
    await fill(page, "#cat-name", `Renamed Cat ${tag}`);
    await realClick(page, 'button[type="submit"]', "Save Changes");
    const renamed = await until(() => p.category.findUnique({ where: { id: created.id } }), (c: any) => c?.name === `Renamed Cat ${tag}`);
    check("edit saved via the API", renamed?.name === `Renamed Cat ${tag}`, renamed);
    await waitForText(page, `Renamed Cat ${tag}`);

    // ---------------------------------------------------------------- 5. delete refused while in use
    await page.goto(`${PANEL}/categories`, { waitUntil: "networkidle2" });
    await waitForText(page, `Used Cat ${tag}`);
    await page.click(`button[aria-label='Delete category "Used Cat ${tag}"']`);
    await realClick(page, "button", "Delete Category", true);
    await waitForText(page, "Couldn't delete the category");
    check("delete of a category with courses is refused", !!(await p.category.findUnique({ where: { id: used.id } })));
    await page.screenshot({ path: `${SHOTS}/cat-2-delete-refused.png` });

    // ---------------------------------------------------------------- 6. delete
    await page.goto(`${PANEL}/categories`, { waitUntil: "networkidle2" });
    await waitForText(page, `Renamed Cat ${tag}`);
    await page.click(`button[aria-label='Delete category "Renamed Cat ${tag}"']`);
    await realClick(page, "button", "Delete Category", true);
    const gone = await until(() => p.category.findUnique({ where: { id: created.id } }), (c) => !c);
    check("delete removed the category via the API", !gone);
    await waitForNoText(page, `Renamed Cat ${tag}`).catch(() => undefined);
    check("deleted category left the list", !(await text(page)).includes(`Renamed Cat ${tag}`));

    // ---------------------------------------------------------------- 7. isolation
    await page.goto(`${PANEL}/categories?drawer=${foreign.id}&mode=edit`, { waitUntil: "networkidle2" });
    await sleep(2000);
    const tIso = await text(page);
    check("another workspace's category can't be opened", !tIso.includes(`Foreign Cat ${tag}`) && !(await page.$("#cat-name")));
    await ctx.close();
  } catch (e) {
    console.log("FAIL exception", (e as Error).message || String(e).slice(0, 400));
    result.bad++;
    await dumpPages(browser, "cat");
  } finally {
    await browser.close();
    await cleanup(ids, tag);
    await report(tag, `, (select count(*)::int from "Category" where slug like '%${tag}%') categories`);
  }
})();
