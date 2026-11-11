import type { AcademyCourseCard, AcademyInstructorSummary } from "./academy-site.types";

/** Subscription states in which an academy's public site is online. */
export const ONLINE_STATUSES = new Set(["TRIALING", "ACTIVE", "PAST_DUE"]);

/** Course text lists are stored as a JSON array string (course builder) or one item per line (older rows). */
export function parseList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const text = raw.trim();
  if (text.startsWith("[")) {
    try {
      const arr: unknown = JSON.parse(text);
      if (Array.isArray(arr)) return arr.map((v) => String(v ?? "").trim()).filter(Boolean);
    } catch {
      /* fall through to line splitting */
    }
  }
  return text
    .split(/\r?\n/)
    .map((s) => s.replace(/^[-•*\d.)\s]+/, "").trim())
    .filter(Boolean);
}

/** Tags are a comma-separated string. */
export const parseTags = (raw: string | null | undefined): string[] =>
  (raw ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

/** "BEGINNER" / "beginner" → "Beginner". */
export const levelLabel = (level: string): string => (level ? level.charAt(0).toUpperCase() + level.slice(1).toLowerCase() : "");

export const round1 = (n: number) => Math.round(n * 10) / 10;

export function instructorSummary(u: { id: string; name: string; avatar: string | null; headline: string | null; expertise?: string | null }): AcademyInstructorSummary {
  return { id: u.id, name: u.name, avatar: u.avatar || null, headline: u.headline || parseTags(u.expertise)[0] || "Instructor" };
}

/** Prisma row (with the includes in COURSE_CARD_INCLUDE) + counts → public card. */
export function toCourseCard(
  c: {
    id: string;
    slug: string;
    title: string;
    shortDescription: string;
    description: string;
    thumbnail: string | null;
    level: string;
    language: string;
    price: unknown;
    isFree: boolean;
    durationMinutes: number;
    ratingAverage: unknown;
    totalStudents: number;
    category: { slug: string; name: string } | null;
    instructor: { id: string; name: string; avatar: string | null; headline: string | null; expertise: string | null };
    _count: { reviews: number; enrollments: number };
  },
  lessons: number,
): AcademyCourseCard {
  const price = Number(c.price ?? 0);
  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    shortDescription: c.shortDescription || c.description.slice(0, 180),
    thumbnail: c.thumbnail || null,
    level: levelLabel(c.level),
    language: c.language,
    price,
    isFree: c.isFree || price <= 0,
    durationMinutes: c.durationMinutes,
    rating: round1(Number(c.ratingAverage ?? 0)),
    reviewCount: c._count.reviews,
    students: Math.max(c.totalStudents, c._count.enrollments),
    lessons,
    category: c.category ? { slug: c.category.slug, name: c.category.name } : null,
    instructor: instructorSummary(c.instructor),
  };
}

export const INSTRUCTOR_SELECT = { id: true, name: true, avatar: true, headline: true, expertise: true } as const;

export const COURSE_CARD_INCLUDE = {
  category: { select: { slug: true, name: true } },
  instructor: { select: INSTRUCTOR_SELECT },
  _count: { select: { reviews: { where: { status: "APPROVED" } }, enrollments: { where: { status: "ACTIVE" } } } },
} as const;
