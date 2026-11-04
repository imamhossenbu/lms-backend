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
      data: { ...dto, icon: iconUrl, status: dto.status ?? "ACTIVE", institutionId: tenantId },
    });
  }

  /** Each category with `_count.courses` and `publishedCourses` (courses with status PUBLISHED). */
  async findAll(tenantId: string | null) {
    const [rows, published] = await Promise.all([
      this.prisma.category.findMany({
        where: { institutionId: tenantId },
        include: {
          _count: {
            select: { courses: true },
          },
        },
        orderBy: { name: "asc" },
      }),
      this.prisma.course.groupBy({ by: ["categoryId"], where: { institutionId: tenantId, status: "PUBLISHED" }, _count: { _all: true } }),
    ]);
    const byCategory = new Map(published.map((p) => [p.categoryId, p._count._all]));
    return rows.map((c) => ({ ...c, publishedCourses: byCategory.get(c.id) ?? 0 }));
  }

  async update(tenantId: string | null, id: string, dto: UpdateCategoryDto, file?: Express.Multer.File) {
    await findCategoryInTenant(this.prisma, tenantId, id);
    if (dto.slug) await assertSlugFree(this.prisma, "category", tenantId, dto.slug, id);
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
