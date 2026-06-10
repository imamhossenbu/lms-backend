import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from "@nestjs/common";
import { CategoryService } from "./category.service";
import { CreateCategoryDto, UpdateCategoryDto } from "./dto/category.dto";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { FileInterceptor } from "@nestjs/platform-express";

@Controller("categories")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post()
  @Roles("ADMIN")
  @UseInterceptors(FileInterceptor("icon"))
  async create(
    @Body() dto: CreateCategoryDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.categoryService.create(dto, file);
  }

  @Get()
  async findAll() {
    return this.categoryService.findAll();
  }

  @Patch(":id")
  @Roles("ADMIN")
  @UseInterceptors(FileInterceptor("icon"))
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateCategoryDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.categoryService.update(id, dto, file);
  }
}
