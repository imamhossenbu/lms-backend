import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { BlogPost, Prisma } from "../../../generated/prisma";
import { paginated, skipTake, type Paginated } from "../../common/pagination";
import { PrismaService } from "../../prisma/prisma.service";
import type { BlogPostFormDto, ListBlogPostsQueryDto, PublicBlogQueryDto, UpdateBlogPostDto } from "./blog.dto";

export interface BlogPostView {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  coverUrl: string;
  category: string;
  tags: string[];
  authorName: string;
  authorRole: string;
  authorAvatarUrl: string;
  readMinutes: number;
  isPublished: boolean;
  featured: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
/** Card data for lists (no body). */
export type PublicBlogCard = Omit<BlogPostView, "content" | "isPublished" | "createdAt" | "updatedAt"> & { publishedAt: string };
export type PublicBlogPost = PublicBlogCard & { content: string; updatedAt: string; related: PublicBlogCard[] };

const toView = (p: BlogPost): BlogPostView => ({
  id: p.id,
  slug: p.slug,
  title: p.title,
  excerpt: p.excerpt,
  content: p.content,
  coverUrl: p.coverUrl,
  category: p.category,
  tags: p.tags,
  authorName: p.authorName,
  authorRole: p.authorRole,
  authorAvatarUrl: p.authorAvatarUrl,
  readMinutes: p.readMinutes,
  isPublished: p.isPublished,
  featured: p.featured,
  publishedAt: p.publishedAt?.toISOString() ?? null,
  createdAt: p.createdAt.toISOString(),
  updatedAt: p.updatedAt.toISOString(),
});
const toCard = (p: BlogPost): PublicBlogCard => {
  const { content: _c, isPublished: _i, createdAt: _cr, updatedAt: _u, ...card } = toView(p);
  return { ...card, publishedAt: (p.publishedAt ?? p.createdAt).toISOString() };
};

/** Lowercase, hyphenated, ASCII slug from a title. */
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "post";

/** ~200 words a minute, at least 1. */
export const readingMinutes = (markdown: string) => Math.max(1, Math.round(markdown.replace(/[#>*_`\-[\]()!]/g, " ").split(/\s+/).filter(Boolean).length / 200));

const PUBLISHED: Prisma.BlogPostWhereInput = { isPublished: true };
const NEWEST: Prisma.BlogPostOrderByWithRelationInput[] = [{ publishedAt: "desc" }, { createdAt: "desc" }];

/** Marketing website blog: owner CRUD (Owner Console › Blog) and the published posts for the website. */
@Injectable()
export class BlogService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------- owner

  async list(q: ListBlogPostsQueryDto): Promise<Paginated<BlogPostView>> {
    const where: Prisma.BlogPostWhereInput = {
      ...(q.status === "published" && { isPublished: true }),
      ...(q.status === "draft" && { isPublished: false }),
      ...(q.category && { category: q.category }),
      ...(q.q && {
        OR: [
          { title: { contains: q.q, mode: "insensitive" as const } },
          { excerpt: { contains: q.q, mode: "insensitive" as const } },
          { category: { contains: q.q, mode: "insensitive" as const } },
        ],
      }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.blogPost.findMany({ where, orderBy: [{ updatedAt: "desc" }], ...skipTake(q) }),
      this.prisma.blogPost.count({ where }),
    ]);
    return paginated(rows.map(toView), total, q);
  }

  async get(id: string): Promise<BlogPostView> {
    const row = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("This post no longer exists.");
    return toView(row);
  }

  async create(dto: BlogPostFormDto): Promise<BlogPostView> {
    const slug = dto.slug ? await this.assertSlugFree(dto.slug) : await this.freeSlug(slugify(dto.title));
    const row = await this.prisma.blogPost.create({
      data: {
        ...dto,
        slug,
        coverUrl: dto.coverUrl ?? "",
        authorAvatarUrl: dto.authorAvatarUrl ?? "",
        readMinutes: readingMinutes(dto.content),
        publishedAt: dto.isPublished ? new Date() : null,
      },
    });
    return toView(row);
  }

  async update(id: string, dto: UpdateBlogPostDto): Promise<BlogPostView> {
    const current = await this.prisma.blogPost.findUnique({ where: { id }, select: { slug: true, publishedAt: true } });
    if (!current) throw new NotFoundException("This post no longer exists.");
    if (dto.slug && dto.slug !== current.slug) await this.assertSlugFree(dto.slug);
    const row = await this.prisma.blogPost.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.content !== undefined && { readMinutes: readingMinutes(dto.content) }),
        // First publish stamps the date; unpublishing keeps it so re-publishing doesn't reorder the archive.
        ...(dto.isPublished && !current.publishedAt && { publishedAt: new Date() }),
      },
    });
    return toView(row);
  }

  async remove(id: string): Promise<void> {
    const row = await this.prisma.blogPost.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw new NotFoundException("This post no longer exists.");
    await this.prisma.blogPost.delete({ where: { id } });
  }

  // ---------------------------------------------------------------- public

  /** Published posts, newest first; `featured` = the newest featured post (only on page 1 without filters). */
  async published(q: PublicBlogQueryDto): Promise<Paginated<PublicBlogCard> & { featured: PublicBlogCard | null; categories: { name: string; count: number }[] }> {
    const page = q.page ?? 1;
    const limit = q.limit ?? 9;
    const filtered = !!(q.q || q.category);
    const featuredRow = !filtered && page === 1 ? await this.prisma.blogPost.findFirst({ where: { ...PUBLISHED, featured: true }, orderBy: NEWEST }) : null;
    const where: Prisma.BlogPostWhereInput = {
      ...PUBLISHED,
      ...(featuredRow && { id: { not: featuredRow.id } }),
      ...(q.category && { category: q.category }),
      ...(q.q && {
        OR: [
          { title: { contains: q.q, mode: "insensitive" as const } },
          { excerpt: { contains: q.q, mode: "insensitive" as const } },
          { tags: { has: q.q } },
        ],
      }),
    };
    const [rows, total, groups] = await Promise.all([
      this.prisma.blogPost.findMany({ where, orderBy: NEWEST, skip: (page - 1) * limit, take: limit }),
      this.prisma.blogPost.count({ where }),
      this.prisma.blogPost.groupBy({ by: ["category"], where: PUBLISHED, _count: { _all: true }, orderBy: { category: "asc" } }),
    ]);
    return {
      ...paginated(rows.map(toCard), total, { page, limit }),
      featured: featuredRow ? toCard(featuredRow) : null,
      categories: groups.map((g) => ({ name: g.category, count: g._count._all })),
    };
  }

  /** One published post by slug, with up to three related posts (same category first, then newest). */
  async bySlug(slug: string): Promise<PublicBlogPost> {
    const row = await this.prisma.blogPost.findFirst({ where: { ...PUBLISHED, slug } });
    if (!row) throw new NotFoundException("This article doesn't exist or isn't published.");
    const same = await this.prisma.blogPost.findMany({ where: { ...PUBLISHED, category: row.category, id: { not: row.id } }, orderBy: NEWEST, take: 3 });
    const more = same.length < 3 ? await this.prisma.blogPost.findMany({ where: { ...PUBLISHED, id: { notIn: [row.id, ...same.map((s) => s.id)] } }, orderBy: NEWEST, take: 3 - same.length }) : [];
    return { ...toCard(row), content: row.content, updatedAt: row.updatedAt.toISOString(), related: [...same, ...more].map(toCard) };
  }

  // ---------------------------------------------------------------- slugs

  private async assertSlugFree(slug: string): Promise<string> {
    const taken = await this.prisma.blogPost.findUnique({ where: { slug }, select: { id: true } });
    if (taken) throw new ConflictException("Another post already uses this URL slug.");
    return slug;
  }

  /** `base`, or `base-2`, `base-3`… whichever is free. */
  private async freeSlug(base: string): Promise<string> {
    const taken = new Set((await this.prisma.blogPost.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } })).map((r) => r.slug));
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  }
}
