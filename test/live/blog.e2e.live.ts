/**
 * Browser E2E for the owner-managed blog: API rules (owner only, DTO validation, drafts hidden, unique slugs), the
 * Owner Console › Blog list + editor (zod errors, slug follows the title, Markdown preview tab in the URL, save as
 * draft, publish), and the website (/blog/[slug] article with contents + related, /blog list, category and search
 * filters in the URL, unknown slug → 404). Console :3011, website :3002, API :4077. Cleanup in `finally`.
 */
import * as bcrypt from "bcrypt";
import { SHOTS, check, fill, launch, newTag, prisma as p, realClick, result, sleep, text, until, waitForText } from "./panel-e2e-helpers";

const CONSOLE = process.env.LIVE_CONSOLE_URL ?? "http://localhost:3011";
const SITE = process.env.LIVE_WEBSITE_URL ?? "http://localhost:3002";
const API = process.env.LIVE_API_URL ?? "http://localhost:4077";
const tag = newTag();

async function api(token: string | null, method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}

const BODY = (n: string) =>
  `An introduction paragraph for the end-to-end test article ${n}, long enough to pass validation and to count words.\n\n## First section ${n}\n\nSome **bold** text, a [link](https://example.com) and a list:\n\n- one\n- two\n\n## Second section\n\n> A quote that should render as a blockquote.\n\nClosing paragraph with more words so the article is comfortably over the minimum length required by the API.`;

(async () => {
  const users: string[] = [];
  const browser = await launch();
  try {
    const owner = await p.user.create({ data: { name: "E2E Owner", email: `${tag}-owner@example.com`, password: await bcrypt.hash("Owner12345", 10), role: "SUPER_ADMIN", status: "ACTIVE", emailVerified: true } });
    const admin = await p.user.create({ data: { name: "E2E Admin", email: `${tag}-admin@example.com`, password: await bcrypt.hash("Admin12345", 10), role: "ADMIN", status: "ACTIVE", emailVerified: true } });
    users.push(owner.id, admin.id);

    // ---------------------------------------------------------------- API rules
    const tAdmin = (await api(null, "POST", "/auth/login", { email: admin.email, password: "Admin12345" })).body?.token;
    check("only the platform owner can manage the blog", (await api(tAdmin, "GET", "/saas/owner/blog")).status === 403);
    const tOwner = (await api(null, "POST", "/auth/login", { email: owner.email, password: "Owner12345" })).body?.token;
    const bad = await api(tOwner, "POST", "/saas/owner/blog", { title: "short", excerpt: "x", content: "y", slug: "Bad Slug!" });
    check("the API validates posts (400)", bad.status === 400, bad.body?.message);
    const draft = await api(tOwner, "POST", "/saas/owner/blog", { title: `API draft post ${tag}`, excerpt: `A summary for the API-created draft post ${tag}.`, content: BODY("api"), category: `E2E ${tag}` });
    check("create from the API generates the slug", draft.status === 201 && draft.body.slug === `api-draft-post-${tag}`, draft.body?.slug);
    const dup = await api(tOwner, "POST", "/saas/owner/blog", { title: `Another ${tag}`, slug: draft.body.slug, excerpt: `A summary for the duplicate slug check ${tag}.`, content: BODY("dup") });
    check("duplicate slugs are rejected (409)", dup.status === 409, dup.status);
    check("drafts are not public", (await api(null, "GET", `/saas/public/blog/${draft.body.slug}`)).status === 404);

    // ---------------------------------------------------------------- console list + editor
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    let leaveWarnings = 0;
    page.on("dialog", (d) => {
      if (d.type() === "beforeunload") leaveWarnings++;
      void d.accept();
    });
    await page.goto(`${CONSOLE}/login`, { waitUntil: "networkidle2" });
    await fill(page, "#console-email", owner.email);
    await fill(page, "#console-password", "Owner12345");
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => location.pathname === "/", { timeout: 25000 });
    await page.goto(`${CONSOLE}/blog?q=${encodeURIComponent(tag)}`, { waitUntil: "networkidle2" });
    await waitForText(page, `API draft post ${tag}`);
    check("console list shows the post with its status", (await text(page)).includes("Draft"));

    await page.goto(`${CONSOLE}/blog/new`, { waitUntil: "networkidle2" });
    await page.waitForSelector("#b-title");
    await realClick(page, 'button[type="submit"]', "Save draft");
    await sleep(600);
    const errs = await text(page);
    check("empty editor shows field errors", errs.includes("at least 8 characters") && errs.includes("at least 200 characters"), errs.slice(0, 200));

    const title = `Console written post ${tag}`;
    await fill(page, "#b-title", title);
    await sleep(300);
    const slug = await page.$eval("#b-slug", (el) => (el as HTMLInputElement).value);
    check("the slug follows the title", slug === `console-written-post-${tag}`, slug);
    await fill(page, "#b-excerpt", `The summary of the post written in the Owner Console editor ${tag}.`);
    await fill(page, "#b-category", `E2E ${tag}`);
    await page.focus("#b-content");
    await page.keyboard.type(BODY("console").slice(0, 60));
    await page.$eval("#b-content", (el, v) => {
      const ta = el as HTMLTextAreaElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(ta, v);
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    }, BODY("console"));
    await realClick(page, '[role="tab"]', "Preview");
    await sleep(500);
    check("preview tab is in the URL and renders Markdown", page.url().includes("tab=preview") && !!(await page.$("blockquote")), page.url());
    await page.reload({ waitUntil: "networkidle2" });
    await sleep(800);
    check("leaving with unsaved changes asks first", leaveWarnings > 0, leaveWarnings);
    check("preview tab survives a reload", !!(await page.$('[role="tab"][aria-selected="true"]')) && (await page.$eval('[role="tab"][aria-selected="true"]', (e) => (e as HTMLElement).innerText)).includes("Preview"));
    // The reload dropped the unsaved draft — fill again in Write and save.
    await realClick(page, '[role="tab"]', "Write");
    await fill(page, "#b-title", title);
    await fill(page, "#b-excerpt", `The summary of the post written in the Owner Console editor ${tag}.`);
    await fill(page, "#b-category", `E2E ${tag}`);
    await page.$eval("#b-content", (el, v) => {
      const ta = el as HTMLTextAreaElement;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(ta, v);
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    }, BODY("console"));
    await realClick(page, 'button[type="submit"]', "Save draft");
    const saved = await until(() => p.blogPost.findFirst({ where: { title } }), (x: any) => !!x);
    check("post saved as a draft with read time", !!saved && saved.isPublished === false && saved.readMinutes >= 1 && saved.slug === `console-written-post-${tag}`, saved);
    await page.waitForFunction((id) => location.pathname === `/blog/${id}`, { timeout: 15000 }, saved.id);
    check("after creating, the editor moves to the post's URL", true);

    // Publish from the editor.
    await page.evaluate(() => {
      const label = [...document.querySelectorAll<HTMLElement>("*")].find((e) => e.childElementCount === 0 && e.innerText?.trim() === "Published" && e.closest("form"));
      let el: HTMLElement | null = label ?? null;
      while (el && !el.querySelector('[role="switch"]')) el = el.parentElement;
      el?.querySelector<HTMLElement>('[role="switch"]')?.click();
    });
    await realClick(page, 'button[type="submit"]', "Save changes");
    const live = await until(() => p.blogPost.findFirst({ where: { title } }), (x: any) => x?.isPublished === true);
    check("publish from the editor stamps publishedAt", live?.isPublished === true && !!live.publishedAt);
    await page.screenshot({ path: `${SHOTS}/blog-1-editor.png` });

    // ---------------------------------------------------------------- website
    const site = await ctx.newPage();
    await site.setViewport({ width: 1440, height: 900 });
    await site.goto(`${SITE}/blog/${live.slug}`, { waitUntil: "networkidle2" });
    const art = await text(site);
    check("website article shows title, author and body", art.includes(title) && art.includes("EduPro Team") && art.includes(`First section console`), art.slice(0, 200));
    check("article has a contents list and rendered quote", /on this page/i.test(art) && !!(await site.$("article blockquote")));
    // The article streams (loading skeleton), so Next marks a missing post with noindex instead of a 404 status.
    const res404 = await site.goto(`${SITE}/blog/no-such-post-${tag}`, { waitUntil: "networkidle2" });
    const noindex = await site.$$eval('meta[name="robots"]', (ms) => ms.some((m) => (m as HTMLMetaElement).content.includes("noindex")));
    check("unknown article → 404 page (noindex)", (await text(site)).includes("doesn't exist") && (res404?.status() === 404 || noindex), { status: res404?.status(), noindex });

    // The list is cached for a minute — reload until the new category shows.
    let listed = false;
    for (let i = 0; i < 9 && !listed; i++) {
      await site.goto(`${SITE}/blog?category=${encodeURIComponent(`E2E ${tag}`)}`, { waitUntil: "networkidle2" });
      listed = (await text(site)).includes(title);
      if (!listed) await sleep(8000);
    }
    check("category filter in the URL lists the post", listed);
    await site.goto(`${SITE}/blog?q=${encodeURIComponent(`Console written post ${tag}`)}`, { waitUntil: "networkidle2" });
    check("search in the URL finds the post", (await text(site)).includes(title));
    await site.screenshot({ path: `${SHOTS}/blog-2-site.png` });
    await site.close();

    // ---------------------------------------------------------------- delete from the list
    await page.bringToFront();
    await page.goto(`${CONSOLE}/blog?q=${encodeURIComponent(title)}`, { waitUntil: "networkidle2" });
    await waitForText(page, title);
    await page.click(`button[aria-label="Actions for ${title}"]`);
    await page.waitForSelector('[role="menuitem"]');
    await realClick(page, '[role="menuitem"]', "Delete");
    await page.waitForSelector('[role="dialog"]');
    await realClick(page, '[role="dialog"] button', "Delete", true);
    check("delete removes it", !(await until(() => p.blogPost.findFirst({ where: { title } }), (x) => !x)));
    await ctx.close();
  } catch (e) {
    console.log("FAIL exception", (e as Error).message || String(e).slice(0, 400));
    result.bad++;
  } finally {
    await browser.close();
    await p.blogPost.deleteMany({ where: { OR: [{ title: { contains: tag } }, { slug: { contains: tag } }] } });
    await p.user.deleteMany({ where: { OR: [{ id: { in: users } }, { email: { startsWith: tag } }] } });
    const left = await p.blogPost.count({ where: { OR: [{ title: { contains: tag } }, { slug: { contains: tag } }] } });
    console.log(`\n${result.ok} passed, ${result.bad} failed | leftovers ${JSON.stringify({ posts: left })}`);
    await p.$disconnect();
  }
})();
