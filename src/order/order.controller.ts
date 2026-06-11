import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  Get,
  Param,
  Patch,
} from "@nestjs/common";
import { Request } from "express";
import { OrderService } from "./order.service";
import { CreateOrderDto } from "./dto/order.dto";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";

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

  @Get("all")
  @Roles("ADMIN")
  async findAll() {
    return await this.orderService.findAll();
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

  @Patch(":id/status")
  @Roles("ADMIN")
  async updateStatus(@Param("id") id: string, @Body("status") status: string) {
    return await this.orderService.updateStatus(id, status);
  }
}
