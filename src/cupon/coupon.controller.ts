import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from "@nestjs/common";
import { CouponService } from "./coupon.service";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { AuthGuard } from "@nestjs/passport";

@Controller("coupon")
@UseGuards(AuthGuard("jwt"))
export class CouponController {
  constructor(private readonly couponService: CouponService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "TEACHER")
  async create(@Body() dto: any) {
    return this.couponService.create(dto);
  }

  @Get()
  async findAll() {
    return this.couponService.findAll();
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    return this.couponService.findOne(id);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "TEACHER")
  async update(@Param("id") id: string, @Body() dto: any) {
    return this.couponService.update(id, dto);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  async delete(@Param("id") id: string) {
    return this.couponService.delete(id);
  }

  @Get("validate/:code/:courseId")
  async validate(
    @Param("code") code: string,
    @Param("courseId") courseId: string,
  ) {
    return this.couponService.validateCoupon(code, courseId);
  }
}
