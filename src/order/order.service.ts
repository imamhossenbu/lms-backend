import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateOrderDto } from "./dto/order.dto";
import { Prisma } from "../../generated/prisma";

@Injectable()
export class OrderService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateOrderDto) {
    const course = await this.prisma.course.findUnique({
      where: { id: dto.courseId },
    });
    if (!course) throw new NotFoundException("Course not found");

    const priceNumber = course.price.toNumber();
    let discount = 0;
    let finalAmount = priceNumber;

    if (dto.couponId) {
      const coupon = await this.prisma.coupon.findUnique({
        where: { id: dto.couponId },
      });

      if (coupon && coupon.usedCount < coupon.maxUses) {
        const discountValue = coupon.discountTypeValue.toNumber();

        discount =
          coupon.discountType === "PERCENTAGE"
            ? (priceNumber * discountValue) / 100
            : discountValue;

        finalAmount = priceNumber - discount;
      }
    }

    return await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          orderNumber: `ORD-${Date.now()}`,
          userId: userId,
          courseId: dto.courseId,

          amount: new Prisma.Decimal(priceNumber),
          discountAmount: new Prisma.Decimal(discount),
          taxAmount: new Prisma.Decimal(0),
          totalAmount: new Prisma.Decimal(finalAmount),
          currency: "BDT",
          status: "PENDING",
          couponId: dto.couponId || null,
        },
      });

      if (dto.couponId) {
        await tx.coupon.update({
          where: { id: dto.couponId },
          data: { usedCount: { increment: 1 } },
        });

        await tx.couponUsage.create({
          data: {
            couponId: dto.couponId,
            userId: userId,
            orderId: order.id,
            discountAmount: new Prisma.Decimal(discount),
          },
        });
      }

      return order;
    });
  }

  async findAll() {
    return await this.prisma.order.findMany({
      orderBy: { createdAt: "desc" },
    });
  }

  async findByStudent(userId: string) {
    return await this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(id: string, userId: string, role: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException("Order not found");

    if (role !== "ADMIN" && order.userId !== userId) {
      throw new ForbiddenException("You do not have access to this order");
    }

    return order;
  }

  async updateStatus(id: string, status: string) {
    return await this.prisma.order.update({
      where: { id },
      data: { status },
    });
  }
}
