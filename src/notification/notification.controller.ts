import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Req,
} from "@nestjs/common";
import { NotificationService } from "./notification.service";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";

@Controller("notification")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class NotificationController {
  constructor(private notificationService: NotificationService) {}

  @Get()
  async getNotifications(@Req() req: any) {
    return await this.notificationService.getMyNotifications(req.user.userId);
  }

  @Patch(":id/read")
  async markAsRead(@Param("id") id: string, @Req() req: any) {
    return await this.notificationService.markAsRead(id, req.user.userId);
  }

  @Roles("ADMIN")
  @Get("templates")
  async getTemplates() {
    return await this.notificationService.getAllTemplates();
  }

  @Roles("ADMIN")
  @Post("templates")
  async createTemplate(@Body() body: any) {
    return await this.notificationService.createTemplate(body);
  }

  @Roles("ADMIN")
  @Patch("templates/:id")
  async updateTemplate(
    @Param("id") id: string,
    @Body() body: { title: string; message: string },
  ) {
    return await this.notificationService.updateTemplate(id, body);
  }
}
