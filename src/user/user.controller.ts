import {
  Controller,
  Get,
  Post,
  BadRequestException,
  Patch,
  Body,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFile,
  Delete,
  Param,
  ParseUUIDPipe,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { UserService } from "./user.service";
import { RequestWithUser } from "../auth/interfaces/request.interface";
import { FileInterceptor } from "@nestjs/platform-express";
import { CloudinaryService } from "./../cloudinary/cloudinary.service";
import { ValidateDto } from "../common/auth-user";
import { RequirePermission } from "../team/permissions.guard";
import { ChangeOwnPasswordDto, ChangeRoleDto, ChangeStatusDto, UpdateProfileDto } from "./dto/user.dto";

/**
 * Own account (me / profile / password) for every signed-in user, plus legacy admin tools for learners and
 * instructors of the admin's workspace. Staff accounts are managed from Team & Roles.
 */
@Controller("user")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ValidateDto()
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @Get("me")
  async getMe(@Req() req: RequestWithUser) {
    return this.userService.findOne(req.user.userId);
  }

  @Patch("profile")
  @UseInterceptors(FileInterceptor("avatar"))
  async updateProfile(@Req() req: RequestWithUser, @Body() dto: UpdateProfileDto, @UploadedFile() file: Express.Multer.File) {
    const avatarUrl = file ? await this.cloudinaryService.uploadImage(file) : undefined;
    return this.userService.updateProfile(req.user.userId, dto, avatarUrl);
  }

  /** Profile photo for any signed-in user (learners on the academy site, teachers, admins): JPG / PNG / WebP up to 3 MB. */
  @Post("avatar")
  @UseInterceptors(FileInterceptor("avatar", { limits: { fileSize: 3 * 1024 * 1024 } }))
  async uploadAvatar(@Req() req: RequestWithUser, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("Choose an image to upload.");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) throw new BadRequestException("Use a JPG, PNG or WebP image.");
    const avatar = await this.cloudinaryService.uploadImage(file);
    await this.userService.setAvatar(req.user.userId, avatar);
    return { avatar };
  }

  @Delete("avatar")
  async removeAvatar(@Req() req: RequestWithUser) {
    await this.userService.setAvatar(req.user.userId, null);
    return { avatar: null };
  }

  @Patch("change-password")
  async changePassword(@Req() req: RequestWithUser, @Body() dto: ChangeOwnPasswordDto) {
    return this.userService.changePassword(req.user.userId, dto.currentPassword, dto.newPassword);
  }

  @Patch("admin/change-role")
  @Roles("ADMIN")
  @RequirePermission("instructors", "manage")
  async changeRole(@Req() req: RequestWithUser, @Body() dto: ChangeRoleDto) {
    return this.userService.changeUserRole(req.user, dto.userId, dto.role);
  }

  @Get("all")
  @Roles("ADMIN")
  @RequirePermission("students", "view")
  async getAllUsers(@Req() req: RequestWithUser) {
    return this.userService.findAll(req.user);
  }

  @Patch("admin/change-status")
  @Roles("ADMIN")
  @RequirePermission("students", "manage")
  async blockUser(@Req() req: RequestWithUser, @Body() dto: ChangeStatusDto) {
    return this.userService.toggleBlockStatus(req.user, dto.userId, dto.status);
  }

  @Delete("admin/:id")
  @Roles("ADMIN")
  @RequirePermission("students", "delete")
  async deleteUser(@Req() req: RequestWithUser, @Param("id", new ParseUUIDPipe({ errorHttpStatusCode: 404 })) id: string) {
    return this.userService.deleteUser(req.user, id);
  }
}
