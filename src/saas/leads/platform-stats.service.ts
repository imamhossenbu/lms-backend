import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export interface PlatformStats {
  /** Workspaces that are active or on a trial. */
  institutions: number;
  /** Student accounts in those workspaces. */
  students: number;
  liveClasses: number;
  /** Published courses in those workspaces. */
  courses: number;
  /** When these numbers were computed (ISO). */
  updatedAt: string;
}

const CACHE_MS = 10 * 60_000;

/** Real, platform-wide counts for the marketing website (public; cached 10 minutes). */
@Injectable()
export class PlatformStatsService {
  private cache: { at: number; value: PlatformStats } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async stats(): Promise<PlatformStats> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.value;
    const live = await this.prisma.institution.findMany({ where: { status: { in: ["ACTIVE", "TRIALING"] } }, select: { id: true } });
    const ids = live.map((i) => i.id);
    const [students, liveClasses, courses] = await Promise.all([
      this.prisma.user.count({ where: { role: "STUDENT", deletedAt: null, institutionId: { in: ids } } }),
      this.prisma.liveClass.count({ where: { institutionId: { in: ids } } }),
      this.prisma.course.count({ where: { status: "PUBLISHED", institutionId: { in: ids } } }),
    ]);
    const value: PlatformStats = { institutions: ids.length, students, liveClasses, courses, updatedAt: new Date().toISOString() };
    this.cache = { at: Date.now(), value };
    return value;
  }
}
