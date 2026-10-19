import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Req,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { EnrollmentService } from "./enrollment.service";
import { RequestWithUser } from "../auth/interfaces/request.interface";

@ApiTags("Enrollments")
@ApiBearerAuth()
@UseGuards(AuthGuard("jwt"))
@Controller("enrollments")
export class EnrollmentController {
  constructor(private readonly enrollmentService: EnrollmentService) {}

  @Get("my-courses")
  @ApiOperation({ summary: "Get all enrolled courses and progress for logged-in student" })
  async getMyCourses(@Req() req: RequestWithUser) {
    return this.enrollmentService.getMyEnrolledCourses(req.user.userId);
  }

  @Get(":courseId/status")
  @ApiOperation({ summary: "Check if the logged-in user is enrolled in a specific course" })
  async getStatus(
    @Req() req: RequestWithUser,
    @Param("courseId") courseId: string,
  ) {
    return this.enrollmentService.getEnrollmentStatus(req.user.userId, courseId);
  }

  @Post("free/:courseId")
  @ApiOperation({ summary: "Directly enroll into a free course without payment" })
  async enrollFree(
    @Req() req: RequestWithUser,
    @Param("courseId") courseId: string,
  ) {
    return this.enrollmentService.enrollFreeCourse(req.user.userId, courseId);
  }
}
