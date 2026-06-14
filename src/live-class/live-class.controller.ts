import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
} from "@nestjs/common";
import { LiveClassService } from "./live-class.service";
import { CreateLiveClassDto, UpdateLiveClassDto } from "./dto/live-class.dto";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";

@Controller("live-class")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class LiveClassController {
  constructor(private liveClassService: LiveClassService) {}

  @Post()
  @Roles("INSTRUCTOR", "ADMIN")
  async create(@Body() body: CreateLiveClassDto, @Req() req: any) {
    return await this.liveClassService.create(req.user.userId, body);
  }

  @Get("all")
  @Roles("ADMIN")
  async getAll() {
    return await this.liveClassService.findAll();
  }

  @Get(":courseId")
  async getByCourse(@Param("courseId") courseId: string) {
    return await this.liveClassService.getAllByCourse(courseId);
  }

  @Patch(":id")
  @Roles("INSTRUCTOR", "ADMIN")
  async update(@Param("id") id: string, @Body() body: UpdateLiveClassDto) {
    return await this.liveClassService.update(id, body);
  }

  @Delete(":id")
  @Roles("ADMIN")
  async delete(@Param("id") id: string) {
    return await this.liveClassService.delete(id);
  }
}
