import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Throttle } from "@nestjs/throttler";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { ValidateDto } from "../../common/auth-user";
import type { RequestWithUser } from "../../auth/interfaces/request.interface";
import { AcademyCheckoutService } from "./academy-checkout.service";
import { LearnerAuthService } from "./learner-auth.service";
import { LearnerPlayerService } from "./learner-player.service";
import { LearnerDashboardService } from "./learner-dashboard.service";
import { CheckoutQuoteQueryDto, LearnerEmailDto, LearnerLoginDto, LearnerPasswordDto, LearnerProfileDto, LearnerRegisterDto, LearnerResetDto, LearnerVerifyDto, LiveQueryDto, StartCheckoutDto } from "./learner.dto";

/** Learner sign-up / sign-in on an academy's website (the site calls these from its own server). */
@ApiTags("Academy site · Learners")
@Controller("academy/public/:slug/auth")
@ValidateDto()
export class LearnerAuthController {
  constructor(private readonly learners: LearnerAuthService) {}

  @Post("register")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: "Create a learner account (STUDENT of this academy) and email a 6-digit code" })
  register(@Param("slug") slug: string, @Body() dto: LearnerRegisterDto) {
    return this.learners.register(slug, dto);
  }

  @Post("verify")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: "Confirm the email code → { token, user } (signed in)" })
  verify(@Param("slug") slug: string, @Body() dto: LearnerVerifyDto, @Req() req: Request) {
    return this.learners.verify(slug, dto, req.ip);
  }

  @Post("resend")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: "Send a new sign-up code" })
  resend(@Param("slug") slug: string, @Body() dto: LearnerEmailDto) {
    return this.learners.resend(slug, dto);
  }

  @Post("forgot")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: "Email a 6-digit password reset code (same answer whether or not the account exists)" })
  forgot(@Param("slug") slug: string, @Body() dto: LearnerEmailDto) {
    return this.learners.forgot(slug, dto);
  }

  @Post("reset")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: "Set a new password with the emailed code (30 min, 5 tries)" })
  reset(@Param("slug") slug: string, @Body() dto: LearnerResetDto) {
    return this.learners.reset(slug, dto);
  }

  @Post("login")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: "Sign in a learner of this academy → { token, user }" })
  login(@Param("slug") slug: string, @Body() dto: LearnerLoginDto, @Req() req: Request) {
    return this.learners.login(slug, dto, req.ip);
  }
}

/** The signed-in learner's own data and course checkout. */
@ApiTags("Academy site · Learners")
@ApiBearerAuth()
@Controller("academy/:slug/me")
@UseGuards(AuthGuard("jwt"))
@ValidateDto()
export class LearnerMeController {
  constructor(
    private readonly learners: LearnerAuthService,
    private readonly checkout: AcademyCheckoutService,
    private readonly player: LearnerPlayerService,
    private readonly dashboard: LearnerDashboardService,
  ) {}

  @Get()
  @ApiOperation({ summary: "The signed-in learner (401 when the token isn't a learner of this academy)" })
  me(@Param("slug") slug: string, @Req() req: RequestWithUser) {
    return this.learners.me(slug, req.user.userId);
  }

  @Get("courses")
  @ApiOperation({ summary: "The learner's enrolled courses in this academy, with progress" })
  courses(@Param("slug") slug: string, @Req() req: RequestWithUser) {
    return this.checkout.myCourses(slug, req.user.userId);
  }

  @Get("courses/:courseSlug/access")
  @ApiOperation({ summary: "Is the learner enrolled in this course?" })
  access(@Param("slug") slug: string, @Param("courseSlug") courseSlug: string, @Req() req: RequestWithUser) {
    return this.checkout.access(slug, req.user.userId, courseSlug);
  }

  @Get("checkout/:courseSlug")
  @ApiOperation({ summary: "Price, coupon discount and total for a course (couponError instead of a 400)" })
  quote(@Param("slug") slug: string, @Param("courseSlug") courseSlug: string, @Query() q: CheckoutQuoteQueryDto, @Req() req: RequestWithUser) {
    return this.checkout.quote(slug, req.user.userId, courseSlug, q.coupon);
  }

  @Post("checkout")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: "Enrol (free / 100% coupon) → ENROLLED, or open SSLCommerz → REDIRECT { gatewayUrl }" })
  start(@Param("slug") slug: string, @Body() dto: StartCheckoutDto, @Req() req: RequestWithUser & Request) {
    return this.checkout.start(slug, req.user.userId, dto.courseSlug, dto.coupon || undefined, { ip: req.ip, device: String(req.headers["user-agent"] ?? "") });
  }

  @Get("orders/:orderId")
  @ApiOperation({ summary: "Outcome of a checkout for the result page" })
  result(@Param("slug") slug: string, @Param("orderId") orderId: string, @Req() req: RequestWithUser) {
    return this.checkout.result(slug, req.user.userId, orderId.slice(0, 64));
  }

  // ---------------------------------------------------------------- course player

  @Get("learn/:courseSlug")
  @ApiOperation({ summary: "Course player outline: modules, lessons with completed / locked state, progress, next lesson" })
  outline(@Param("slug") slug: string, @Param("courseSlug") courseSlug: string, @Req() req: RequestWithUser) {
    return this.player.outline(slug, req.user.userId, courseSlug);
  }

  @Get("learn/:courseSlug/lessons/:lessonId")
  @ApiOperation({ summary: "One lesson's content, visible resources and the learner's progress (gated)" })
  lesson(@Param("slug") slug: string, @Param("courseSlug") courseSlug: string, @Param("lessonId", ParseUUIDPipe) lessonId: string, @Req() req: RequestWithUser) {
    return this.player.lesson(slug, req.user.userId, courseSlug, lessonId);
  }

  @Post("learn/:courseSlug/lessons/:lessonId/complete")
  @HttpCode(200)
  @ApiOperation({ summary: "Mark a lesson complete → fresh outline (progress, certificate auto-issue)" })
  complete(@Param("slug") slug: string, @Param("courseSlug") courseSlug: string, @Param("lessonId", ParseUUIDPipe) lessonId: string, @Req() req: RequestWithUser) {
    return this.player.complete(slug, req.user.userId, courseSlug, lessonId);
  }

  // ---------------------------------------------------------------- dashboard

  @Get("dashboard")
  @ApiOperation({ summary: "Dashboard overview: stats, continue learning, next live classes, recent quiz results" })
  overview(@Param("slug") slug: string, @Req() req: RequestWithUser) {
    return this.dashboard.overview(slug, req.user.userId);
  }

  @Get("live-classes")
  @ApiOperation({ summary: "Live classes of the learner's courses (join link only shortly before start)" })
  live(@Param("slug") slug: string, @Query() q: LiveQueryDto, @Req() req: RequestWithUser) {
    return this.dashboard.liveClasses(slug, req.user.userId, q.when ?? "upcoming");
  }

  @Get("assignments")
  @ApiOperation({ summary: "Published assignments of the learner's courses with their own submission state" })
  assignments(@Param("slug") slug: string, @Req() req: RequestWithUser) {
    return this.dashboard.assignments(slug, req.user.userId);
  }

  @Get("quiz-results")
  @ApiOperation({ summary: "The learner's quiz attempts (newest first)" })
  quizResults(@Param("slug") slug: string, @Req() req: RequestWithUser) {
    return this.dashboard.quizResults(slug, req.user.userId);
  }

  @Get("certificates")
  @ApiOperation({ summary: "The learner's certificates with verify links" })
  certificates(@Param("slug") slug: string, @Req() req: RequestWithUser) {
    return this.dashboard.certificates(slug, req.user.userId);
  }

  @Get("orders")
  @ApiOperation({ summary: "The learner's orders with invoices" })
  orders(@Param("slug") slug: string, @Req() req: RequestWithUser) {
    return this.dashboard.orders(slug, req.user.userId);
  }

  @Get("profile")
  @ApiOperation({ summary: "The learner's profile" })
  profile(@Param("slug") slug: string, @Req() req: RequestWithUser) {
    return this.dashboard.profile(slug, req.user.userId);
  }

  @Patch("profile")
  @ApiOperation({ summary: "Update name, phone, bio, country" })
  updateProfile(@Param("slug") slug: string, @Body() dto: LearnerProfileDto, @Req() req: RequestWithUser) {
    return this.dashboard.updateProfile(slug, req.user.userId, dto);
  }

  @Post("password")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: "Change password (current password required; workspace password policy applies)" })
  changePassword(@Param("slug") slug: string, @Body() dto: LearnerPasswordDto, @Req() req: RequestWithUser) {
    return this.dashboard.changePassword(slug, req.user.userId, dto.currentPassword, dto.newPassword);
  }
}
