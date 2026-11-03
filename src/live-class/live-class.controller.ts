import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, RequireRoles, ValidateDto, type AuthUser } from "../common/auth-user";
import { AskQuestionDto } from "../live-classes/dto/live-class.dto";
import { LiveClassService } from "./live-class.service";

const Uuid = (name: string) => Param(name, new ParseUUIDPipe({ errorHttpStatusCode: 404 }));

/** Student side of live classes: schedule of a course, RSVP, ask questions, shared resources. */
@ApiTags("Live classes (student)")
@Controller("live-class")
@RequireRoles("STUDENT", "ADMIN")
@ValidateDto()
export class LiveClassController {
  constructor(private readonly service: LiveClassService) {}

  @Get("course/:courseId")
  @ApiOperation({ summary: "Classes of an enrolled course (meeting link only when shared with students)" })
  byCourse(@CurrentUser() user: AuthUser, @Uuid("courseId") courseId: string) {
    return this.service.listForCourse(user, courseId);
  }

  @Post(":id/rsvp")
  @HttpCode(200)
  rsvp(@CurrentUser() user: AuthUser, @Uuid("id") id: string) {
    return this.service.rsvp(user, id);
  }

  @Post(":id/questions")
  ask(@CurrentUser() user: AuthUser, @Uuid("id") id: string, @Body() dto: AskQuestionDto) {
    return this.service.ask(user, id, dto.question);
  }

  @Get(":id/resources")
  resources(@CurrentUser() user: AuthUser, @Uuid("id") id: string) {
    return this.service.resources(user, id);
  }
}
