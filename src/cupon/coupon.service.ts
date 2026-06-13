import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class CouponService {
  constructor(private prisma: PrismaService) {}

  async create(data: any) {
    return await this.prisma.coupon.create({ data });
  }

  async findAll() {
    return await this.prisma.coupon.findMany({
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(id: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new NotFoundException("Coupon not found");
    return coupon;
  }

  async update(id: string, data: any) {
    return await this.prisma.coupon.update({ where: { id }, data });
  }

  async delete(id: string) {
    return await this.prisma.coupon.delete({ where: { id } });
  }

  async validateCoupon(code: string, courseId: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { code } });

    if (!coupon) throw new NotFoundException("Coupon code is invalid");
    if (coupon.courseId !== courseId)
      throw new BadRequestException("Coupon not applicable for this course");
    if (new Date() > coupon.endDate)
      throw new BadRequestException("Coupon has expired");
    if (coupon.usedCount >= coupon.maxUses)
      throw new BadRequestException("Coupon limit reached");

    return coupon;
  }
}
