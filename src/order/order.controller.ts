import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  Get,
  Param,
} from "@nestjs/common";
import { Request } from "express";
import { OrderService } from "./order.service";
import { CreateOrderDto } from "./dto/order.dto";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";

/**
 * Student checkout API. Admin order management lives in /admin/orders and /admin/payments (src/orders).
 */
@Controller("orders")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  @Roles("STUDENT", "ADMIN")
  async create(@Req() req: Request, @Body() dto: CreateOrderDto) {
    const user = req.user as any;

    if (!user.userId) {
      throw new Error("User ID is missing from the token!");
    }

    return await this.orderService.create(user.userId, dto);
  }

  @Get("my-orders")
  @Roles("STUDENT", "ADMIN")
  async findMyOrders(@Req() req: Request) {
    const user = req.user as any;
    return await this.orderService.findByStudent(user.userId);
  }

  @Get(":id")
  @Roles("STUDENT", "ADMIN")
  async getOrder(@Req() req: Request, @Param("id") id: string) {
    const user = req.user as any;
    return await this.orderService.findOne(id, user.userId, user.role);
  }
}
