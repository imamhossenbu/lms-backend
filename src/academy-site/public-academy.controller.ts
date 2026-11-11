import { Controller, Get, Param, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ValidateDto } from "../common/auth-user";
import { AcademySiteService } from "./academy-site.service";
import { AcademyCoursesQueryDto, AcademyReviewsQueryDto, ResolveAcademyQueryDto } from "./dto/academy-query.dto";

/**
 * Unauthenticated, read-only data for each academy's public website (lms-academy-site). The site renders on the
 * server, so all visitors share its IP — hence the higher rate limit.
 */
@ApiTags("Academy site · Public")
@Controller("academy/public")
@ValidateDto()
@Throttle({ default: { limit: 600, ttl: 60_000 } })
export class PublicAcademyController {
  constructor(private readonly academy: AcademySiteService) {}

  @Get("resolve")
  @ApiOperation({ summary: "Find the academy for a host: <slug>.<ACADEMY_ROOT_DOMAIN> or a verified custom domain" })
  resolve(@Query() q: ResolveAcademyQueryDto) {
    return this.academy.resolveHost(q.host);
  }

  @Get(":slug")
  @ApiOperation({ summary: "Academy profile: name, branding, contact, headline stats and categories with published courses" })
  profile(@Param("slug") slug: string) {
    return this.academy.profile(slug);
  }

  @Get(":slug/courses")
  @ApiOperation({ summary: "Published courses (search, category, level, price, instructor, sort, paging)" })
  courses(@Param("slug") slug: string, @Query() q: AcademyCoursesQueryDto) {
    return this.academy.courses(slug, q);
  }

  @Get(":slug/levels")
  @ApiOperation({ summary: "Levels used by published courses (catalogue filter)" })
  levels(@Param("slug") slug: string) {
    return this.academy.levels(slug);
  }

  @Get(":slug/courses/:courseSlug")
  @ApiOperation({ summary: "Published course page: outline (no lesson content), instructor, rating breakdown, reviews, related" })
  course(@Param("slug") slug: string, @Param("courseSlug") courseSlug: string) {
    return this.academy.course(slug, courseSlug);
  }

  @Get(":slug/instructors")
  @ApiOperation({ summary: "Instructors with at least one published course" })
  instructors(@Param("slug") slug: string) {
    return this.academy.instructors(slug);
  }

  @Get(":slug/reviews")
  @ApiOperation({ summary: "Top approved reviews across the academy's published courses" })
  reviews(@Param("slug") slug: string, @Query() q: AcademyReviewsQueryDto) {
    return this.academy.reviews(slug, q.limit ?? 6);
  }
}
