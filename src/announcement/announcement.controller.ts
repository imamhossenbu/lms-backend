import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
} from "@nestjs/common";
import { AnnouncementService } from "./announcement.service";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";

@Controller("announcement")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class AnnouncementController {
  constructor(private announcementService: AnnouncementService) {}

  @Post()
  @Roles("ADMIN", "TEACHER")
  async create(@Body() body: any, @Req() req: any) {
    return await this.announcementService.create({
      ...body,
      createdBy: req.user.userId,
    });
  }

  @Get("all")
  @Roles("ADMIN")
  async getAll() {
    return await this.announcementService.getAll();
  }

  @Get(":courseId")
  async getByCourse(@Param("courseId") courseId: string) {
    return await this.announcementService.getAllByCourse(courseId);
  }

  @Patch(":id")
  @Roles("ADMIN", "TEACHER")
  async update(@Param("id") id: string, @Body() body: any) {
    return await this.announcementService.update(id, body);
  }

  @Delete(":id")
  @Roles("ADMIN")
  async delete(@Param("id") id: string) {
    return await this.announcementService.delete(id);
  }
}
