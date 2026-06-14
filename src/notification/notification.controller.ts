import { Controller, Get, Patch, Param, UseGuards, Req } from "@nestjs/common";
import { NotificationService } from "./notification.service";
import { AuthGuard } from "@nestjs/passport";

@Controller("notification")
@UseGuards(AuthGuard("jwt"))
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
}
