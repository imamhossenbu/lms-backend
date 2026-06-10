import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFile,
  Delete,
  Param,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { UserService } from "./user.service";
import { RequestWithUser } from "../auth/interfaces/request.interface";
import { FileInterceptor } from "@nestjs/platform-express";
import { CloudinaryService } from "./../cloudinary/cloudinary.service";

@Controller("user")
@UseGuards(AuthGuard("jwt"), RolesGuard)
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
  async updateProfile(
    @Req() req: RequestWithUser,
    @Body() data: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    let avatarUrl: string | undefined = undefined;

    if (file) {
      avatarUrl = await this.cloudinaryService.uploadImage(file);
    }

    return this.userService.updateProfile(req.user.userId, data, avatarUrl);
  }

  @Patch("admin/change-role")
  @Roles("ADMIN")
  async changeRole(@Body() body: { userId: string; role: string }) {
    return this.userService.changeUserRole(body.userId, body.role);
  }

  @Patch("teacher/action")
  @Roles("ADMIN", "TEACHER")
  async teacherAction() {
    return { message: "Action performed by authorized personnel" };
  }

  @Get("all")
  @Roles("ADMIN")
  async getAllUsers() {
    return await this.userService.findAll();
  }

  @Patch("admin/block")
  @Roles("ADMIN")
  async blockUser(@Body() body: { userId: string; status: string }) {
    return await this.userService.toggleBlockStatus(body.userId, body.status);
  }

  @Patch("admin/approve/:id")
  @Roles("ADMIN")
  async approveUser(@Param("id") id: string) {
    return await this.userService.toggleBlockStatus(id, "ACTIVE");
  }

  @Delete("admin/:id")
  @Roles("ADMIN")
  async deleteUser(@Param("id") id: string) {
    return await this.userService.deleteUser(id);
  }
}
