import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, RequireRoles, SaasValidation, type AuthUser } from "../controllers/saas-controller.utils";
import { PLATFORM_OWNER_ROLE } from "../saas.constants";
import { CouponFormDto, ListCouponsQueryDto, SetCouponActiveDto } from "./dto/coupon.dto";
import { CouponsService } from "./services/coupons.service";

const Id = () => Param("id", new ParseUUIDPipe({ errorHttpStatusCode: 404 }));

/** Owner Console › Coupons (discounts on SaaS subscriptions). Bodies are the console's CouponFormValues. */
@ApiTags("SaaS · Owner")
@Controller("saas/owner/coupons")
@RequireRoles(PLATFORM_OWNER_ROLE)
@SaasValidation()
export class OwnerCouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get()
  @ApiOperation({ summary: "Coupons with redemptions + derived status — ?q, ?status, ?type, ?page, ?limit → { data, meta }" })
  list(@Query() q: ListCouponsQueryDto) {
    return this.coupons.list(q);
  }

  @Get("stats")
  @ApiOperation({ summary: "KPI cards: active, redemptions (+ last 30 days), discount given, expiring in 7 days" })
  stats() {
    return this.coupons.stats();
  }

  @Get(":id")
  get(@Id() id: string) {
    return this.coupons.get(id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CouponFormDto) {
    return this.coupons.create(dto, user.userId);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Edit (whole form). A redeemed coupon's code can't change." })
  update(@Id() id: string, @Body() dto: CouponFormDto) {
    return this.coupons.update(id, dto);
  }

  @Patch(":id/active")
  @ApiOperation({ summary: "Enable / disable — running discounts keep going when disabled" })
  setActive(@Id() id: string, @Body() dto: SetCouponActiveDto) {
    return this.coupons.setActive(id, dto.active);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete a never-redeemed coupon" })
  remove(@Id() id: string) {
    return this.coupons.remove(id);
  }
}
