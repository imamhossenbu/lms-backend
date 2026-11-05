import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
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

  /**
   * Checks a parent choice: same workspace, top level itself, not the category itself, and the category being
   * moved under it has no children of its own (sub-categories are one level deep).
   */
  private async assertParent(tenantId: string | null, parentId: string | null | undefined, selfId?: string) {
    if (!parentId) return;
    if (parentId === selfId) throw new BadRequestException("A category can't be its own parent.");
    const parent = await this.prisma.category.findFirst({ where: { id: parentId, institutionId: tenantId } });
    if (!parent) throw new BadRequestException("Parent category not found.");
    if (parent.parentId) throw new BadRequestException("Pick a top-level category as the parent. Sub-categories can't have their own sub-categories.");
    if (selfId && (await this.prisma.category.count({ where: { parentId: selfId } })))
      throw new BadRequestException("This category has sub-categories, so it can't become a sub-category itself.");
  }

  async create(tenantId: string | null, dto: CreateCategoryDto, file?: Express.Multer.File) {
    await assertSlugFree(this.prisma, "category", tenantId, dto.slug);
    await this.assertParent(tenantId, dto.parentId);
    let iconUrl: string | undefined = dto.icon;
    if (file) {
      iconUrl = await this.cloudinary.uploadImage(file);
    }
    return await this.prisma.category.create({
      data: { ...dto, icon: iconUrl, status: dto.status ?? "ACTIVE", institutionId: tenantId },
    });
  }

  /** Each category with `_count.courses` / `_count.children` and `publishedCourses` (courses with status PUBLISHED). */
  async findAll(tenantId: string | null) {
    const [rows, published] = await Promise.all([
      this.prisma.category.findMany({
        where: { institutionId: tenantId },
        include: {
          _count: {
            select: { courses: true, children: true },
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
    if (dto.parentId !== undefined) await this.assertParent(tenantId, dto.parentId, id);
    let iconUrl: string | undefined = undefined;
    if (file) {
      iconUrl = await this.cloudinary.uploadImage(file);
    }
    return await this.prisma.category.update({
      where: { id },
      data: { ...dto, ...(iconUrl && { icon: iconUrl }) },
    });
  }

  /** Refused while courses or sub-categories still use the category (move them first). */
  async delete(tenantId: string | null, id: string) {
    await findCategoryInTenant(this.prisma, tenantId, id);
    const children = await this.prisma.category.count({ where: { parentId: id } });
    if (children) throw new ConflictException(`This category has ${children} sub-categor${children === 1 ? "y" : "ies"}. Move or delete ${children === 1 ? "it" : "them"} first.`);
    const courses = await this.prisma.course.count({ where: { categoryId: id } });
    if (courses) throw new ConflictException(`${courses} course${courses === 1 ? " still uses" : "s still use"} this category. Move ${courses === 1 ? "it" : "them"} to another category first.`);
    return await this.prisma.category.delete({ where: { id } });
  }
}
