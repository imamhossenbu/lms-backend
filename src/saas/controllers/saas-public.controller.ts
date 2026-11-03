import { Body, Controller, Get, HttpCode, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CheckCouponDto } from "../coupons/dto/coupon.dto";
import { CouponRedemptionsService } from "../coupons/services/coupon-redemptions.service";
import { SlugAvailabilityQueryDto } from "../dto/institution.dto";
import { SignupDto } from "../dto/signup.dto";
import { SaasInstitutionsService } from "../services/saas-institutions.service";
import { SaasPlansService } from "../services/saas-plans.service";
import { SaasValidation } from "./saas-controller.utils";

/** Unauthenticated endpoints for the public pricing + /signup pages. */
@ApiTags("SaaS · Public")
@Controller("saas/public")
@SaasValidation()
export class SaasPublicController {
  constructor(
    private readonly plans: SaasPlansService,
    private readonly institutions: SaasInstitutionsService,
    private readonly coupons: CouponRedemptionsService,
  ) {}

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
