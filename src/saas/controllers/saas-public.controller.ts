import { Body, Controller, Get, HttpCode, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { Throttle } from "@nestjs/throttler";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CheckCouponDto } from "../coupons/dto/coupon.dto";
import { CouponRedemptionsService } from "../coupons/services/coupon-redemptions.service";
import { SlugAvailabilityQueryDto } from "../dto/institution.dto";
import { SignupDto } from "../dto/signup.dto";
import { SaasInstitutionsService } from "../services/saas-institutions.service";
import { SaasPlansService } from "../services/saas-plans.service";
import { SaasValidation } from "./saas-controller.utils";
import { ContactRequestDto } from "../leads/contact.dto";
import { MarketingLeadsService } from "../leads/marketing-leads.service";
import { PlatformStatsService } from "../leads/platform-stats.service";
import { TestimonialsService } from "../testimonials/testimonials.service";

/** Unauthenticated endpoints for the public pricing + /signup pages. */
@ApiTags("SaaS · Public")
@Controller("saas/public")
@SaasValidation()
export class SaasPublicController {
  constructor(
    private readonly plans: SaasPlansService,
    private readonly institutions: SaasInstitutionsService,
    private readonly coupons: CouponRedemptionsService,
    private readonly leads: MarketingLeadsService,
    private readonly platformStats: PlatformStatsService,
    private readonly testimonials: TestimonialsService,
  ) {}

  @Get("testimonials")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: "Published testimonials for the marketing website (owner-managed), in order" })
  publishedTestimonials() {
    return this.testimonials.published();
  }

  @Get("stats")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: "Real platform-wide counts for the marketing website (active institutions, students, live classes, published courses); cached 10 min" })
  stats() {
    return this.platformStats.stats();
  }

  @Post("contact")
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: "Marketing website contact / demo form: stores the lead and emails the platform owner" })
  contact(@Body() dto: ContactRequestDto, @Req() req: Request) {
    return this.leads.create(dto, req.ip ?? "");
  }

  @Get("plans")
  @ApiOperation({ summary: "Public, non-archived plans (pricing / signup page)" })
  listPlans() {
    return this.plans.listPublic();
  }

  @Get("slug-availability")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: "Check whether <slug>.edupro.com is free" })
  slugAvailability(@Query() q: SlugAvailabilityQueryDto) {
    return this.institutions.checkSlug(q.slug);
  }

  @Post("coupons/check")
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: "Check a coupon code for a plan / cycle and preview the discounted first invoice (pre-tax)" })
  checkCoupon(@Body() dto: CheckCouponDto) {
    return this.coupons.check(dto.code, dto.planId, dto.cycle);
  }

  @Post("signup")
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: "Self-signup: create an institution on a free trial + its admin account (optional couponCode)" })
  signup(@Body() dto: SignupDto) {
    return this.institutions.signup(dto);
  }
}
