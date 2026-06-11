import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateOrderDto } from "./dto/order.dto";

@Injectable()
export class OrderService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateOrderDto) {
    const course = await this.prisma.course.findUnique({
      where: { id: dto.courseId },
    });
    if (!course) throw new NotFoundException("Course not found");
    return await this.prisma.order.create({
      data: {
        orderNumber: `ORD-${Date.now()}`,
        userId,
        courseId: dto.courseId,
        amount: course.price,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: course.price,
        currency: "BDT",
        status: "PENDING",
        couponId: dto.couponId || null,
      },
    });
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException("Order not found");
    return order;
  }

  async updateStatus(id: string, status: string) {
    return await this.prisma.order.update({
      where: { id },
      data: { status },
    });
  }
}
