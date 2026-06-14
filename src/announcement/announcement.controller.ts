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

@Controller("announcement")
@UseGuards(AuthGuard("jwt"))
export class AnnouncementController {
  constructor(private announcementService: AnnouncementService) {}

  @Post()
  async create(@Body() body: any, @Req() req: any) {
    return await this.announcementService.create({
      ...body,
      createdBy: req.user.userId,
    });
  }

  @Get(":courseId")
  async getByCourse(@Param("courseId") courseId: string) {
    return await this.announcementService.getAllByCourse(courseId);
  }

  @Patch(":id") 
  async update(@Param("id") id: string, @Body() body: any) {
    return await this.announcementService.update(id, body);
  }

  @Delete(":id")
  async delete(@Param("id") id: string) {
    return await this.announcementService.delete(id);
  }
}
