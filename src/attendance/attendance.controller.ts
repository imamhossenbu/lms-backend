import {
  Controller,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Req,
  Get,
  Delete,
} from "@nestjs/common";
import { AttendanceService } from "./attendance.service";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";

@Controller("attendance")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class AttendanceController {
  constructor(private attendanceService: AttendanceService) {}

  @Post("check-in")
  async checkIn(@Body("liveClassId") liveClassId: string, @Req() req: any) {
    return await this.attendanceService.checkIn(req.user.userId, liveClassId);
  }

  @Patch("ping/:id")
  async ping(@Param("id") id: string) {
    return await this.attendanceService.ping(id);
  }

  @Patch("status/:id")
  async updateStatus(
    @Param("id") id: string,
    @Body("status") status: "ACTIVE" | "SUSPENDED",
  ) {
    return await this.attendanceService.updateStatus(id, status);
  }

  @Patch("check-out/:id")
  async checkOut(@Param("id") id: string) {
    return await this.attendanceService.checkOut(id);
  }

  @Get("class/:liveClassId")
  @Roles("ADMIN", "TEACHER")
  async getByClass(@Param("liveClassId") liveClassId: string) {
    return await this.attendanceService.getByLiveClassId(liveClassId);
  }

  @Patch("admin/update-duration/:id")
  @Roles("ADMIN", "TEACHER")
  async updateDuration(
    @Param("id") id: string,
    @Body("minutes") minutes: number,
  ) {
    return await this.attendanceService.updateDuration(id, minutes);
  }

  @Delete("admin/:id")
  @Roles("ADMIN", "TEACHER")
  async remove(@Param("id") id: string) {
    return await this.attendanceService.remove(id);
  }
}
