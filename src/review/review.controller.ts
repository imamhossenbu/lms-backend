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
import { ValidateDto } from "../common/auth-user";
import { tenantOf } from "../common/tenancy";
import { RequirePermission } from "../team/permissions.guard";
import { CreateReviewDto, ReviewStatusDto, UpdateReviewDto } from "./dto/review.dto";

@Controller("review")
@ValidateDto()
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post()
  @UseGuards(AuthGuard("jwt"))
  async create(@Req() req: any, @Body() dto: CreateReviewDto) {
    return await this.reviewService.createReview(req.user.userId, dto);
  }

  @Get(":courseId")
  async findAll(@Param("courseId") courseId: string) {
    return await this.reviewService.getReviewsByCourse(courseId);
  }

  @Patch(":id")
  @UseGuards(AuthGuard("jwt"))
  async update(@Param("id") id: string, @Req() req: any, @Body() dto: UpdateReviewDto) {
    return await this.reviewService.updateReview(id, req.user.userId, dto);
  }

  @Delete(":id")
  @UseGuards(AuthGuard("jwt"))
  async delete(@Param("id") id: string, @Req() req: any) {
    return await this.reviewService.deleteReview(id, req.user.userId, req.user.role, tenantOf(req.user));
  }

  @Patch(":id/status")
  @RequirePermission("courses", "manage")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN")
  async updateStatus(@Param("id") id: string, @Body() dto: ReviewStatusDto, @Req() req: any) {
    return await this.reviewService.updateStatus(tenantOf(req.user), id, dto.status);
  }

  @Get("user/my-reviews")
  @UseGuards(AuthGuard("jwt"))
  async getMyReviews(@Req() req: any) {
    return await this.reviewService.getReviewsByUser(req.user.userId);
  }

  @Get("admin/all")
  @RequirePermission("courses", "view")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN")
  async getAllForAdmin(@Req() req: any) {
    return await this.reviewService.getAllReviews(tenantOf(req.user));
  }
}
