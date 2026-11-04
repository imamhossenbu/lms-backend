import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { findCourseInTenant } from "../common/tenancy";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateCouponDto, UpdateCouponDto } from "./dto/coupon.dto";

/** Course coupons, one set per workspace (tenant). */
@Injectable()
export class CouponService {
  constructor(private prisma: PrismaService) {}

  private async mustFind(tenantId: string | null, id: string) {
    const coupon = await this.prisma.coupon.findFirst({ where: { id, institutionId: tenantId } });
    if (!coupon) throw new NotFoundException("Coupon not found");
    return coupon;
  }

  private async assertCodeFree(tenantId: string | null, code: string, exceptId?: string) {
    const clash = await this.prisma.coupon.findFirst({ where: { institutionId: tenantId, code, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
    if (clash) throw new ConflictException(`Coupon ${code} already exists in this workspace.`);
  }

  private assertRules(v: { discountType: string; discountTypeValue: number; startDate: Date; endDate: Date }) {
    if (v.discountType === "PERCENTAGE" && v.discountTypeValue > 100) throw new BadRequestException("A percentage discount can't be more than 100");
    if (v.endDate <= v.startDate) throw new BadRequestException("End date must be after the start date");
  }

  async create(tenantId: string | null, dto: CreateCouponDto) {
    await findCourseInTenant(this.prisma, tenantId, dto.courseId, { id: true });
    await this.assertCodeFree(tenantId, dto.code);
    this.assertRules(dto);
    return this.prisma.coupon.create({ data: { ...dto, institutionId: tenantId } });
  }

  async findAll(tenantId: string | null) {
    return this.prisma.coupon.findMany({ where: { institutionId: tenantId }, orderBy: { createdAt: "desc" } });
  }

  async findOne(tenantId: string | null, id: string) {
    return this.mustFind(tenantId, id);
  }

  async update(tenantId: string | null, id: string, dto: UpdateCouponDto) {
    const current = await this.mustFind(tenantId, id);
    if (dto.courseId) await findCourseInTenant(this.prisma, tenantId, dto.courseId, { id: true });
    if (dto.code) await this.assertCodeFree(tenantId, dto.code, id);
    this.assertRules({
      discountType: dto.discountType ?? current.discountType,
      discountTypeValue: dto.discountTypeValue ?? Number(current.discountTypeValue),
      startDate: dto.startDate ?? current.startDate,
      endDate: dto.endDate ?? current.endDate,
    });
    return this.prisma.coupon.update({ where: { id }, data: dto });
  }

  /** Coupons already used on orders stay for the order history — deactivate those instead. */
  async delete(tenantId: string | null, id: string) {
    await this.mustFind(tenantId, id);
    const used = await this.prisma.order.count({ where: { couponId: id } });
    if (used) throw new ConflictException(`This coupon was used on ${used} order${used === 1 ? "" : "s"}. Set it to INACTIVE instead.`);
    await this.prisma.couponUsage.deleteMany({ where: { couponId: id } });
    return this.prisma.coupon.delete({ where: { id } });
  }

  /** Checkout check: the code must exist in the course's own workspace and be usable today. */
  async validateCoupon(code: string, courseId: string) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId }, select: { institutionId: true } });
    if (!course) throw new NotFoundException("Course not found");
    const coupon = await this.prisma.coupon.findFirst({ where: { institutionId: course.institutionId, code: code.trim().toUpperCase() } });

    if (!coupon || coupon.status !== "ACTIVE") throw new NotFoundException("Coupon code is invalid");
    if (coupon.courseId !== courseId) throw new BadRequestException("Coupon not applicable for this course");
    const now = new Date();
    if (now < coupon.startDate) throw new BadRequestException("Coupon isn't active yet");
    if (now > coupon.endDate) throw new BadRequestException("Coupon has expired");
    if (coupon.usedCount >= coupon.maxUses) throw new BadRequestException("Coupon limit reached");
    return coupon;
  }
}
