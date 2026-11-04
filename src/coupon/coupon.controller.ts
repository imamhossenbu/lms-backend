import { StaffPermission } from "../team/permissions.guard";
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ApiTags } from "@nestjs/swagger";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { CurrentUser, ValidateDto, type AuthUser } from "../common/auth-user";
import { tenantOf } from "../common/tenancy";
import { CouponService } from "./coupon.service";
import { CreateCouponDto, UpdateCouponDto } from "./dto/coupon.dto";

const Id = () => Param("id", new ParseUUIDPipe({ errorHttpStatusCode: 404 }));

/** Course coupons. CRUD is scoped to the caller's workspace; `validate` is the public checkout check. */
@ApiTags("Coupons")
@Controller("coupon")
@ValidateDto()
export class CouponController {
  constructor(private readonly couponService: CouponService) {}

  @Get("validate/:code/:courseId")
  validate(@Param("code") code: string, @Param("courseId", new ParseUUIDPipe({ errorHttpStatusCode: 404 })) courseId: string) {
    return this.couponService.validateCoupon(code, courseId);
  }

  @StaffPermission("courses", "view")
  @Get()
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "TEACHER")
  findAll(@CurrentUser() user: AuthUser) {
    return this.couponService.findAll(tenantOf(user));
  }

  @StaffPermission("courses", "view")
  @Get(":id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "TEACHER")
  findOne(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.couponService.findOne(tenantOf(user), id);
  }

  @StaffPermission("courses", "manage")
  @Post()
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "TEACHER")
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCouponDto) {
    return this.couponService.create(tenantOf(user), dto);
  }

  @StaffPermission("courses", "manage")
  @Patch(":id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "TEACHER")
  update(@CurrentUser() user: AuthUser, @Id() id: string, @Body() dto: UpdateCouponDto) {
    return this.couponService.update(tenantOf(user), id, dto);
  }

  @StaffPermission("courses", "delete")
  @Delete(":id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN")
  delete(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.couponService.delete(tenantOf(user), id);
  }
}
