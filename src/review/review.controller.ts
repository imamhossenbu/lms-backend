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
import { ReviewService } from "./review.service";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";

@Controller("review")
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post()
  @UseGuards(AuthGuard("jwt"))
  async create(@Req() req: any, @Body() dto: any) {
    return await this.reviewService.createReview(req.user.userId, dto);
  }

  @Get(":courseId")
  async findAll(@Param("courseId") courseId: string) {
    return await this.reviewService.getReviewsByCourse(courseId);
  }

  @Patch(":id")
  @UseGuards(AuthGuard("jwt"))
  async update(@Param("id") id: string, @Req() req: any, @Body() dto: any) {
    return await this.reviewService.updateReview(id, req.user.userId, dto);
  }

  @Delete(":id")
  @UseGuards(AuthGuard("jwt"))
  async delete(@Param("id") id: string, @Req() req: any) {
    return await this.reviewService.deleteReview(
      id,
      req.user.userId,
      req.user.role,
    );
  }

  @Patch(":id/status")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN")
  async updateStatus(
    @Param("id") id: string,
    @Body("status") status: "APPROVED" | "REJECTED",
  ) {
    return await this.reviewService.updateStatus(id, status);
  }

  @Get("user/my-reviews")
  @UseGuards(AuthGuard("jwt"))
  async getMyReviews(@Req() req: any) {
    return await this.reviewService.getReviewsByUser(req.user.userId);
  }

  @Get("admin/all")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN")
  async getAllForAdmin() {
    return await this.reviewService.getAllReviews();
  }
}
