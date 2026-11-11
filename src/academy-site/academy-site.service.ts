import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { SAAS_ROOT_DOMAIN } from "../saas/saas.constants";
import { WorkspaceSettingsReader } from "../workspace-settings/services/workspace-settings-reader.service";
import type { AcademyCoursesQueryDto } from "./dto/academy-query.dto";
import {
  COURSE_CARD_INCLUDE,
  INSTRUCTOR_SELECT,
  ONLINE_STATUSES,
  instructorSummary,
  parseList,
  parseTags,
  round1,
  toCourseCard,
} from "./academy-site.mapper";
import type {
  AcademyCourseCard,
  AcademyCourseDetail,
  AcademyInstructor,
  AcademyPage,
  AcademyProfile,
  AcademyReview,
} from "./academy-site.types";

const PUBLISHED = "PUBLISHED";

/**
 * Read-only data for an academy's public website. Everything is scoped to one institution (by slug) and only
 * PUBLISHED courses / lessons and APPROVED reviews are ever returned. Lesson content is never exposed here —
 * only the curriculum outline (the student app loads content through the gated lesson endpoint).
 */
@Injectable()
export class AcademySiteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: WorkspaceSettingsReader,
  ) {}

  // ------------------------------------------------------------------ tenant

  /** Host → slug: `<slug>.<SAAS_ROOT_DOMAIN>` or a verified custom domain. */
  async resolveHost(rawHost: string): Promise<{ slug: string }> {
    const host = rawHost.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
    const root = (process.env.SAAS_ROOT_DOMAIN || SAAS_ROOT_DOMAIN).trim().toLowerCase();
    if (root && host.endsWith(`.${root}`)) {
      const sub = host.slice(0, -(root.length + 1));
      if (sub && !sub.includes(".")) {
        const inst = await this.prisma.institution.findUnique({ where: { slug: sub }, select: { slug: true } });
        if (inst) return inst;
      }
    }
    const domain = await this.prisma.customDomain.findFirst({
      where: { domain: { in: [host, host.replace(/^www\./, "")] }, status: "VERIFIED" },
      select: { institution: { select: { slug: true } } },
    });
    if (!domain) throw new NotFoundException("Academy not found");
    return { slug: domain.institution.slug };
  }

  private async institution(slug: string) {
    const inst = await this.prisma.institution.findUnique({
      where: { slug: slug.trim().toLowerCase() },
      select: { id: true, slug: true, name: true, logoInitials: true, tone: true, status: true },
    });
    if (!inst) throw new NotFoundException("Academy not found");
    return inst;
  }

  /** Tenant id of an online academy, else 404 / 403 ACADEMY_UNAVAILABLE. */
  private async onlineTenant(slug: string): Promise<string> {
    const inst = await this.institution(slug);
    if (!ONLINE_STATUSES.has(inst.status)) throw new ForbiddenException({ code: "ACADEMY_UNAVAILABLE", message: "This academy is temporarily unavailable." });
    return inst.id;
  }

  private publishedWhere(tenantId: string): Prisma.CourseWhereInput {
    return { institutionId: tenantId, status: PUBLISHED };
  }

  /** Published-lesson counts per course id. */
  private async lessonCounts(courseIds: string[]): Promise<Map<string, number>> {
    if (courseIds.length === 0) return new Map();
    const rows = await this.prisma.lesson.groupBy({ by: ["courseId"], where: { courseId: { in: courseIds }, status: PUBLISHED }, _count: { _all: true } });
    return new Map(rows.map((r) => [r.courseId, r._count._all]));
  }

  private async cards(rows: Parameters<typeof toCourseCard>[0][]): Promise<AcademyCourseCard[]> {
    const counts = await this.lessonCounts(rows.map((r) => r.id));
    return rows.map((r) => toCourseCard(r, counts.get(r.id) ?? 0));
  }

  // ------------------------------------------------------------------ profile

  async profile(slug: string): Promise<AcademyProfile> {
    const inst = await this.institution(slug);
    const settings = await this.settings.all(inst.id);
    const base = {
      slug: inst.slug,
      name: settings.general.platformName || inst.name,
      logoInitials: inst.logoInitials,
      tone: inst.tone,
      tagline: settings.general.tagline,
      supportEmail: settings.general.supportEmail,
      supportPhone: settings.general.supportPhone,
      address: settings.general.address,
      websiteUrl: settings.general.websiteUrl,
      currency: settings.general.currency,
      timezone: settings.general.timezone,
      branding: {
        logoUrl: settings.branding.logoUrl,
        logoDarkUrl: settings.branding.logoDarkUrl,
        faviconUrl: settings.branding.faviconUrl,
        accent: settings.branding.accent,
        footerText: settings.branding.footerText,
        showPoweredBy: settings.branding.showPoweredBy,
      },
      maintenance: {
        enabled: settings.maintenance.maintenanceMode,
        message: settings.maintenance.maintenanceMode ? settings.maintenance.maintenanceMessage : "",
        until: settings.maintenance.maintenanceUntil,
      },
    };
    const empty = { stats: { courses: 0, students: 0, instructors: 0, lessons: 0, rating: 0, reviews: 0 }, categories: [] };
    if (!ONLINE_STATUSES.has(inst.status)) return { available: false, ...base, ...empty };

    const where = this.publishedWhere(inst.id);
    const [courses, students, instructors, lessons, reviewAgg, categories] = await Promise.all([
      this.prisma.course.count({ where }),
      this.prisma.user.count({ where: { institutionId: inst.id, role: "STUDENT", deletedAt: null } }),
      this.prisma.course.findMany({ where, distinct: ["instructorId"], select: { instructorId: true } }),
      this.prisma.lesson.count({ where: { status: PUBLISHED, module: { course: where } } }),
      this.prisma.courseReview.aggregate({ where: { status: "APPROVED", course: where }, _avg: { rating: true }, _count: { _all: true } }),
      this.prisma.category.findMany({
        where: { institutionId: inst.id, courses: { some: where } },
        select: { id: true, slug: true, name: true, icon: true, _count: { select: { courses: { where } } } },
        orderBy: { name: "asc" },
      }),
    ]);
    return {
      available: true,
      ...base,
      stats: {
        courses,
        students,
        instructors: instructors.length,
        lessons,
        rating: round1(reviewAgg._avg.rating ?? 0),
        reviews: reviewAgg._count._all,
      },
      categories: categories
        .map((c) => ({ id: c.id, slug: c.slug, name: c.name, icon: c.icon, courses: c._count.courses }))
        .sort((a, b) => b.courses - a.courses),
    };
  }

  // ------------------------------------------------------------------ courses

  async courses(slug: string, q: AcademyCoursesQueryDto): Promise<AcademyPage<AcademyCourseCard>> {
    const tenantId = await this.onlineTenant(slug);
    const page = q.page ?? 1;
    const limit = q.limit ?? 12;
    const where: Prisma.CourseWhereInput = { ...this.publishedWhere(tenantId) };
    if (q.category) where.category = { slug: q.category };
    if (q.level) where.level = { equals: q.level, mode: "insensitive" };
    if (q.instructor) where.instructorId = q.instructor;
    if (q.price === "free") where.OR = [{ isFree: true }, { price: { lte: 0 } }];
    if (q.price === "paid") where.AND = [{ isFree: false }, { price: { gt: 0 } }];
    if (q.q?.trim()) {
      const term = q.q.trim();
      const search: Prisma.CourseWhereInput[] = [
        { title: { contains: term, mode: "insensitive" } },
        { shortDescription: { contains: term, mode: "insensitive" } },
        { tags: { contains: term, mode: "insensitive" } },
      ];
      where.AND = [...((where.AND as Prisma.CourseWhereInput[]) ?? []), { OR: search }];
    }
    const orderBy: Prisma.CourseOrderByWithRelationInput[] =
      q.sort === "rating"
        ? [{ ratingAverage: "desc" }, { totalStudents: "desc" }]
        : q.sort === "priceAsc"
          ? [{ price: "asc" }]
          : q.sort === "priceDesc"
            ? [{ price: "desc" }]
            : q.sort === "newest"
              ? [{ id: "desc" }]
              : [{ totalStudents: "desc" }, { ratingAverage: "desc" }];

    const [rows, total] = await Promise.all([
      this.prisma.course.findMany({ where, include: COURSE_CARD_INCLUDE, orderBy: [...orderBy, { title: "asc" }], skip: (page - 1) * limit, take: limit }),
      this.prisma.course.count({ where }),
    ]);
    return { data: await this.cards(rows), pagination: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) } };
  }

  /** Distinct levels of published courses (catalogue filter options). */
  async levels(slug: string): Promise<string[]> {
    const tenantId = await this.onlineTenant(slug);
    const rows = await this.prisma.course.findMany({ where: this.publishedWhere(tenantId), distinct: ["level"], select: { level: true } });
    const order = ["beginner", "intermediate", "advanced", "expert"];
    const labels = [...new Set(rows.map((r) => r.level.trim()).filter(Boolean).map((l) => l.charAt(0).toUpperCase() + l.slice(1).toLowerCase()))];
    const rank = (l: string) => (order.includes(l.toLowerCase()) ? order.indexOf(l.toLowerCase()) : order.length);
    return labels.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  }

  async course(slug: string, courseSlug: string): Promise<AcademyCourseDetail> {
    const tenantId = await this.onlineTenant(slug);
    const row = await this.prisma.course.findFirst({
      where: { ...this.publishedWhere(tenantId), slug: courseSlug },
      include: {
        ...COURSE_CARD_INCLUDE,
        modules: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            title: true,
            description: true,
            durationMinutes: true,
            lessons: {
              where: { status: PUBLISHED },
              orderBy: { order: "asc" },
              select: { id: true, title: true, type: true, durationMinutes: true, isPreview: true },
            },
          },
        },
      },
    });
    if (!row) throw new NotFoundException("Course not found");

    const modules = row.modules
      .filter((m) => m.lessons.length > 0)
      .map((m) => ({ ...m, durationMinutes: m.durationMinutes || m.lessons.reduce((s, l) => s + l.durationMinutes, 0) }));
    const lessons = modules.flatMap((m) => m.lessons);
    const lessonTypes = lessons.reduce<Record<string, number>>((acc, l) => ({ ...acc, [l.type]: (acc[l.type] ?? 0) + 1 }), {});

    const [breakdownRows, reviewRows, relatedRows, instructor] = await Promise.all([
      this.prisma.courseReview.groupBy({ by: ["rating"], where: { courseId: row.id, status: "APPROVED" }, _count: { _all: true } }),
      this.prisma.courseReview.findMany({
        where: { courseId: row.id, status: "APPROVED" },
        orderBy: [{ rating: "desc" }, { createdAt: "desc" }],
        take: 6,
        select: { id: true, rating: true, reviewText: true, createdAt: true, user: { select: { name: true, avatar: true } } },
      }),
      this.prisma.course.findMany({
        where: { ...this.publishedWhere(tenantId), id: { not: row.id }, OR: [{ categoryId: row.categoryId }, { instructorId: row.instructorId }] },
        include: COURSE_CARD_INCLUDE,
        orderBy: [{ totalStudents: "desc" }],
        take: 3,
      }),
      this.instructorProfile(tenantId, row.instructorId),
    ]);

    const card = toCourseCard(row, lessons.length);
    const reviewCount = breakdownRows.reduce((s, r) => s + r._count._all, 0);
    const average = reviewCount ? breakdownRows.reduce((s, r) => s + r.rating * r._count._all, 0) / reviewCount : card.rating;
    return {
      ...card,
      rating: round1(average),
      durationMinutes: row.durationMinutes || lessons.reduce((s, l) => s + l.durationMinutes, 0),
      description: row.description,
      requirements: parseList(row.requirements),
      outcomes: parseList(row.learningOutcomes),
      tags: parseTags(row.tags),
      modules,
      lessonTypes,
      instructorProfile: instructor ?? { ...instructorSummary(row.instructor), bio: "", expertise: [], courses: 1, students: card.students, rating: card.rating },
      ratingBreakdown: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: breakdownRows.find((r) => r.rating === stars)?._count._all ?? 0 })),
      reviews: reviewRows.map((r) => ({ id: r.id, rating: r.rating, text: r.reviewText ?? "", createdAt: r.createdAt, student: { name: r.user.name, avatar: r.user.avatar } })),
      related: await this.cards(relatedRows),
    };
  }

  // ------------------------------------------------------------------ instructors

  private async instructorProfile(tenantId: string, userId: string): Promise<AcademyInstructor | null> {
    const list = await this.instructorList(tenantId, [userId]);
    return list[0] ?? null;
  }

  private async instructorList(tenantId: string, onlyIds?: string[]): Promise<AcademyInstructor[]> {
    const where: Prisma.CourseWhereInput = { ...this.publishedWhere(tenantId), ...(onlyIds ? { instructorId: { in: onlyIds } } : {}) };
    const courses = await this.prisma.course.findMany({
      where,
      select: { instructorId: true, totalStudents: true, ratingAverage: true, _count: { select: { enrollments: { where: { status: "ACTIVE" } } } } },
    });
    const ids = [...new Set(courses.map((c) => c.instructorId))];
    if (ids.length === 0) return [];
    const users = await this.prisma.user.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { ...INSTRUCTOR_SELECT, bio: true } });
    return users
      .map((u) => {
        const own = courses.filter((c) => c.instructorId === u.id);
        const rated = own.filter((c) => Number(c.ratingAverage) > 0);
        return {
          ...instructorSummary(u),
          bio: u.bio ?? "",
          expertise: parseTags(u.expertise),
          courses: own.length,
          students: own.reduce((s, c) => s + Math.max(c.totalStudents, c._count.enrollments), 0),
          rating: rated.length ? round1(rated.reduce((s, c) => s + Number(c.ratingAverage), 0) / rated.length) : 0,
        };
      })
      .sort((a, b) => b.students - a.students || b.courses - a.courses || a.name.localeCompare(b.name));
  }

  async instructors(slug: string): Promise<AcademyInstructor[]> {
    return this.instructorList(await this.onlineTenant(slug));
  }

  // ------------------------------------------------------------------ reviews

  /** Best recent approved reviews with text, across the academy (home page "What students say"). */
  async reviews(slug: string, limit = 6): Promise<AcademyReview[]> {
    const tenantId = await this.onlineTenant(slug);
    const rows = await this.prisma.courseReview.findMany({
      where: { status: "APPROVED", reviewText: { not: null }, NOT: { reviewText: "" }, course: this.publishedWhere(tenantId) },
      orderBy: [{ rating: "desc" }, { createdAt: "desc" }],
      take: limit,
      select: {
        id: true,
        rating: true,
        reviewText: true,
        createdAt: true,
        user: { select: { name: true, avatar: true } },
        course: { select: { slug: true, title: true } },
      },
    });
    return rows.map((r) => ({ id: r.id, rating: r.rating, text: r.reviewText ?? "", createdAt: r.createdAt, student: { name: r.user.name, avatar: r.user.avatar }, course: r.course }));
  }
}
