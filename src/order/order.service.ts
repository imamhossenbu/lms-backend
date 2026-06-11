import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
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
        userId: userId,
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
