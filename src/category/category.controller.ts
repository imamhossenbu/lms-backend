import { ValidateDto } from "../common/auth-user";
import { RequirePermission } from "../team/permissions.guard";
import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Query,
  Req,
} from "@nestjs/common";
import { CategoryService } from "./category.service";
import { CreateCategoryDto, UpdateCategoryDto } from "./dto/category.dto";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { FileInterceptor } from "@nestjs/platform-express";
import type { RequestWithUser } from "../auth/interfaces/request.interface";
import { OptionalJwtGuard } from "../common/optional-jwt.guard";
import { resolvePublicTenant, tenantOf } from "../common/tenancy";
import { PrismaService } from "../prisma/prisma.service";

@Controller("categories")
@ValidateDto()
export class CategoryController {
  constructor(
    private readonly categoryService: CategoryService,
    private readonly prisma: PrismaService,
  ) {}

  @RequirePermission("categories", "manage")
  @Post()
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN")
  @UseInterceptors(FileInterceptor("icon"))
  async create(
    @Body() dto: CreateCategoryDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: RequestWithUser,
  ) {
    return this.categoryService.create(tenantOf(req.user), dto, file);
  }

  /** The signed-in user's workspace, or `?institution=<slug>`, or the legacy workspace. */
  @Get()
  @UseGuards(OptionalJwtGuard)
  async findAll(@Query("institution") institution: string | undefined, @Req() req: Partial<RequestWithUser>) {
    return this.categoryService.findAll(await resolvePublicTenant(this.prisma, req.user as any, institution));
  }

  @RequirePermission("categories", "manage")
  @Patch(":id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN")
  @UseInterceptors(FileInterceptor("icon"))
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateCategoryDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: RequestWithUser,
  ) {
    return this.categoryService.update(tenantOf(req.user), id, dto, file);
  }

  @RequirePermission("categories", "delete")
  @Delete(":id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN")
  async delete(@Param("id") id: string, @Req() req: RequestWithUser) {
    return this.categoryService.delete(tenantOf(req.user), id);
  }
}
