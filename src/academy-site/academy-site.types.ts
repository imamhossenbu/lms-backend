import type { BrandingSettings, GeneralSettings } from "../workspace-settings/workspace-settings.types";

/** Shapes returned by /academy/public/* — the contract the academy website (lms-academy-site) reads. */

export interface AcademyCategory {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  courses: number;
}

export interface AcademyProfile {
  /** false = subscription cancelled / suspended: the site shows a "temporarily unavailable" page. */
  available: boolean;
  slug: string;
  name: string;
  logoInitials: string;
  tone: string;
  tagline: string;
  supportEmail: string;
  supportPhone: string;
  address: string;
  websiteUrl: string;
  currency: GeneralSettings["currency"];
  timezone: string;
  branding: Pick<BrandingSettings, "logoUrl" | "logoDarkUrl" | "faviconUrl" | "accent" | "footerText" | "showPoweredBy">;
  maintenance: { enabled: boolean; message: string; until: string };
  stats: { courses: number; students: number; instructors: number; lessons: number; rating: number; reviews: number };
  categories: AcademyCategory[];
}

export interface AcademyInstructorSummary {
  id: string;
  name: string;
  avatar: string | null;
  headline: string;
}

export interface AcademyCourseCard {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  thumbnail: string | null;
  level: string;
  language: string;
  price: number;
  isFree: boolean;
  durationMinutes: number;
  rating: number;
  reviewCount: number;
  students: number;
  lessons: number;
  category: { slug: string; name: string } | null;
  instructor: AcademyInstructorSummary;
}

export interface AcademyLessonOutline {
  id: string;
  title: string;
  type: string;
  durationMinutes: number;
  isPreview: boolean;
}

export interface AcademyModuleOutline {
  id: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  lessons: AcademyLessonOutline[];
}

export interface AcademyReview {
  id: string;
  rating: number;
  text: string;
  createdAt: Date;
  student: { name: string; avatar: string | null };
  course?: { slug: string; title: string };
}

export interface AcademyInstructor extends AcademyInstructorSummary {
  bio: string;
  expertise: string[];
  courses: number;
  students: number;
  rating: number;
}

export interface AcademyCourseDetail extends AcademyCourseCard {
  description: string;
  requirements: string[];
  outcomes: string[];
  tags: string[];
  modules: AcademyModuleOutline[];
  lessonTypes: Record<string, number>;
  instructorProfile: AcademyInstructor;
  ratingBreakdown: { stars: number; count: number }[];
  reviews: AcademyReview[];
  related: AcademyCourseCard[];
}

export interface AcademyPage<T> {
  data: T[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}
