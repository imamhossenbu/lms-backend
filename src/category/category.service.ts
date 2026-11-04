import { ConflictException, Injectable } from "@nestjs/common";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { assertSlugFree, findCategoryInTenant } from "../common/tenancy";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCategoryDto, UpdateCategoryDto } from "./dto/category.dto";

/** Course categories — one set per workspace (tenant). */
@Injectable()
export class CategoryService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
  ) {}

  async create(tenantId: string | null, dto: CreateCategoryDto, file?: Express.Multer.File) {
    await assertSlugFree(this.prisma, "category", tenantId, dto.slug);
    let iconUrl: string | undefined = dto.icon;
    if (file) {
      iconUrl = await this.cloudinary.uploadImage(file);
    }
    return await this.prisma.category.create({
      data: { ...dto, icon: iconUrl, status: "ACTIVE", institutionId: tenantId },
    });
  }

  async findAll(tenantId: string | null) {
    return await this.prisma.category.findMany({
      where: { institutionId: tenantId },
      include: {
        _count: {
          select: { courses: true },
        },
      },
      orderBy: { name: "asc" },
    });
  }

  async update(tenantId: string | null, id: string, dto: UpdateCategoryDto, file?: Express.Multer.File) {
    await findCategoryInTenant(this.prisma, tenantId, id);
    let iconUrl: string | undefined = undefined;
    if (file) {
      iconUrl = await this.cloudinary.uploadImage(file);
    }
    return await this.prisma.category.update({
      where: { id },
      data: { ...dto, ...(iconUrl && { icon: iconUrl }) },
    });
  }

  /** Refused while courses still use the category (move them first). */
  async delete(tenantId: string | null, id: string) {
    await findCategoryInTenant(this.prisma, tenantId, id);
    const courses = await this.prisma.course.count({ where: { categoryId: id } });
    if (courses) throw new ConflictException(`${courses} course${courses === 1 ? " still uses" : "s still use"} this category. Move ${courses === 1 ? "it" : "them"} to another category first.`);
    return await this.prisma.category.delete({ where: { id } });
  }
}
