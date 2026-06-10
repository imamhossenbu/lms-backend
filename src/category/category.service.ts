import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { CreateCategoryDto, UpdateCategoryDto } from "./dto/category.dto";

@Injectable()
export class CategoryService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
  ) {}

  async create(dto: CreateCategoryDto, file?: Express.Multer.File) {
    let iconUrl: string | undefined = undefined;
    if (file) {
      iconUrl = await this.cloudinary.uploadImage(file);
    }
    return await this.prisma.category.create({
      data: { ...dto, icon: iconUrl, status: "ACTIVE" },
    });
  }

  async findAll() {
    return await this.prisma.category.findMany();
  }

  async update(id: string, dto: UpdateCategoryDto, file?: Express.Multer.File) {
    let iconUrl: string | undefined = undefined;
    if (file) {
      iconUrl = await this.cloudinary.uploadImage(file);
    }
    return await this.prisma.category.update({
      where: { id },
      data: { ...dto, ...(iconUrl && { icon: iconUrl }) },
    });
  }
}
