import { Module } from "@nestjs/common";
import { LiveClassesModule } from "../live-classes/live-classes.module";
import { PrismaModule } from "../prisma/prisma.module";
import { AttendanceController } from "./attendance.controller";
import { AttendanceService } from "./attendance.service";

/** Student check-in / heartbeat / check-out for live classes. Admin overrides live at /admin/live-classes/:id/attendance. */
@Module({
  imports: [PrismaModule, LiveClassesModule],
  controllers: [AttendanceController],
  providers: [AttendanceService],
})
export class AttendanceModule {}
