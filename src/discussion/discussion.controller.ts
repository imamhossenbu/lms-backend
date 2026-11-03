import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, RequireRoles, ValidateDto, type AuthUser } from "../common/auth-user";
import { AcceptReplyDto, CreateReplyDto, ReplyBodyDto } from "../community/dto/reply.dto";
import { CreateReportDto } from "../community/dto/report.dto";
import { StudentThreadDto, StudentThreadQueryDto, UpdateStudentThreadDto } from "../community/dto/thread.dto";
import { DiscussionService } from "./discussion.service";

const Id = (name = "id") => Param(name, new ParseUUIDPipe({ errorHttpStatusCode: 404 }));

/**
 * Student side of Community: course discussions for enrolled students (and the course's instructor).
 * Admins moderate at /admin/community.
 */
@ApiTags("Discussions (student)")
@Controller("discussion")
@RequireRoles("STUDENT", "TEACHER", "ADMIN")
@ValidateDto()
export class DiscussionController {
  constructor(private readonly service: DiscussionService) {}

  @Get("course/:courseId")
  @ApiOperation({ summary: "Visible discussions of a course the user belongs to (paginated, filters, per-tab counts)" })
  list(@CurrentUser() user: AuthUser, @Id("courseId") courseId: string, @Query() q: StudentThreadQueryDto) {
    return this.service.list(user, courseId, q);
  }

  @Get(":id")
  @ApiOperation({ summary: "Discussion with its replies; counts a view" })
  detail(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.service.detail(user, id);
  }

  @Post()
  @ApiOperation({ summary: "Start a discussion in an enrolled course (announcements are staff-only)" })
  create(@CurrentUser() user: AuthUser, @Body() dto: StudentThreadDto) {
    return this.service.create(user, dto);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Edit your own discussion" })
  update(@CurrentUser() user: AuthUser, @Id() id: string, @Body() dto: UpdateStudentThreadDto) {
    return this.service.update(user, id, dto);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete your own discussion and its replies" })
  remove(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.service.remove(user, id);
  }

  @Put(":id/accepted-reply")
  @ApiOperation({ summary: "Accept (or clear with null) the answer to your own question" })
  accept(@CurrentUser() user: AuthUser, @Id() id: string, @Body() dto: AcceptReplyDto) {
    return this.service.accept(user, id, dto);
  }

  @Post(":id/report")
  @ApiOperation({ summary: "Report the discussion, or one of its replies with replyId" })
  report(@CurrentUser() user: AuthUser, @Id() id: string, @Body() dto: CreateReportDto) {
    return this.service.report(user, id, dto);
  }

  // Reply routes
  @Post(":id/reply")
  @ApiOperation({ summary: "Reply (parentId = answer a reply; one nesting level). Locked discussions refuse replies." })
  addReply(@CurrentUser() user: AuthUser, @Id() id: string, @Body() dto: CreateReplyDto) {
    return this.service.reply(user, id, dto);
  }

  @Patch("reply/:replyId")
  @ApiOperation({ summary: "Edit your own reply" })
  updateReply(@CurrentUser() user: AuthUser, @Id("replyId") replyId: string, @Body() dto: ReplyBodyDto) {
    return this.service.editReply(user, replyId, dto);
  }

  @Delete("reply/:replyId")
  @ApiOperation({ summary: "Delete your own reply (not once others have answered it)" })
  deleteReply(@CurrentUser() user: AuthUser, @Id("replyId") replyId: string) {
    return this.service.removeReply(user, replyId);
  }
}
