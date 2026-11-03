import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsUUID } from "class-validator";
import { CurrentUser, RequireRoles, ValidateDto, type AuthUser } from "../common/auth-user";
import { AttendanceService } from "./attendance.service";

class CheckInDto {
  @IsUUID("all", { message: "liveClassId must be a valid id" }) liveClassId!: string;
}

const Id = () => Param("id", new ParseUUIDPipe({ errorHttpStatusCode: 404 }));

/** Students: join (check-in), once-a-minute heartbeat (ping), leave (check-out). Only on their own records. */
@ApiTags("Attendance (student)")
@Controller("attendance")
@RequireRoles("STUDENT")
@ValidateDto()
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Post("check-in")
  checkIn(@CurrentUser() user: AuthUser, @Body() dto: CheckInDto) {
    return this.attendance.checkIn(user, dto.liveClassId);
  }

  @Patch("ping/:id")
  @HttpCode(200)
  ping(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.attendance.ping(user, id);
  }

  @Patch("check-out/:id")
  checkOut(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.attendance.checkOut(user, id);
  }
}
