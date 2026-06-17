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

import { AuthGuard } from "@nestjs/passport";
import { DiscussionService } from "./discussion.service";

@Controller("discussion")
@UseGuards(AuthGuard("jwt"))
export class DiscussionController {
  constructor(private readonly discussionService: DiscussionService) {}

  @Post()
  async create(@Req() req: any, @Body() dto: any) {
    return await this.discussionService.createDiscussion(req.user.userId, dto);
  }

  @Get("course/:courseId")
  async findAll(@Param("courseId") courseId: string) {
    return await this.discussionService.findAllByCourse(courseId);
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Req() req: any, @Body() dto: any) {
    return await this.discussionService.updateDiscussion(
      id,
      req.user.userId,
      dto,
    );
  }

  @Delete(":id")
  async delete(@Param("id") id: string, @Req() req: any) {
    return await this.discussionService.deleteDiscussion(id, req.user.userId);
  }

  // Reply Routes
  @Post(":id/reply")
  async addReply(@Param("id") id: string, @Req() req: any, @Body() dto: any) {
    return await this.discussionService.addReply(id, req.user.userId, dto);
  }

  @Patch("reply/:replyId")
  async updateReply(
    @Param("replyId") replyId: string,
    @Req() req: any,
    @Body() dto: { body: string },
  ) {
    return await this.discussionService.updateReply(
      replyId,
      req.user.userId,
      dto.body,
    );
  }

  @Delete("reply/:replyId")
  async deleteReply(@Param("replyId") replyId: string, @Req() req: any) {
    return await this.discussionService.deleteReply(replyId, req.user.userId);
  }
}
