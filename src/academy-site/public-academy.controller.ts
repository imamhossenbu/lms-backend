import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { Throttle } from "@nestjs/throttler";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ValidateDto } from "../common/auth-user";
import { AcademySiteService } from "./academy-site.service";
import { AcademyContactDto, AcademyCoursesQueryDto, AcademyReviewsQueryDto, NewsletterDto, ResolveAcademyQueryDto } from "./dto/academy-query.dto";

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
  @ApiOperation({ summary: "Find the academy for a host: <slug>.<SAAS_ROOT_DOMAIN> or a verified custom domain" })
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

  @Post(":slug/newsletter")
  @HttpCode(200)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @ApiOperation({ summary: "Newsletter sign-up for this academy (idempotent; honeypot `website` must be empty)" })
  async newsletter(@Param("slug") slug: string, @Body() dto: NewsletterDto, @Req() req: Request) {
    // Bots fill the hidden field: answer as if it worked, store nothing.
    if (dto.website) return { message: "You're subscribed! Watch your inbox for new courses and offers." };
    return this.academy.subscribe(slug, dto.email, dto.name ?? "", dto.source ?? "website", req.ip ?? "");
  }

  @Post(":slug/contact")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: "Website contact form: stored for Admin › Website › Messages and emailed to the support address" })
  async contact(@Param("slug") slug: string, @Body() dto: AcademyContactDto, @Req() req: Request) {
    if (dto.website) return { message: "Thanks! Your message has been sent — we'll get back to you soon." };
    return this.academy.contact(slug, dto, req.ip ?? "");
  }
}
