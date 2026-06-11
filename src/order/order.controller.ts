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

@Controller("orders")
@UseGuards(AuthGuard("jwt"))
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  async create(@Req() req: Request, @Body() dto: CreateOrderDto) {
    const userId = (req.user as any).id;
    return await this.orderService.create(userId, dto);
  }

  @Get(":id")
  async getOrder(@Param("id") id: string) {
    return await this.orderService.findOne(id);
  }
}
