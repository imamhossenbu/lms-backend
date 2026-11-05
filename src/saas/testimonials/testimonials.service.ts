import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, Testimonial } from "../../../generated/prisma";
import { paginated, skipTake, type Paginated } from "../../common/pagination";
import { PrismaService } from "../../prisma/prisma.service";
import type { ListTestimonialsQueryDto, TestimonialFormDto, UpdateTestimonialDto } from "./testimonial.dto";

export interface TestimonialView {
  id: string;
  quote: string;
  name: string;
  role: string;
  avatarUrl: string;
  isPublished: boolean;
  featured: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}
export type PublicTestimonial = Pick<TestimonialView, "id" | "quote" | "name" | "role" | "avatarUrl" | "featured">;

const toView = (t: Testimonial): TestimonialView => ({
  id: t.id,
  quote: t.quote,
  name: t.name,
  role: t.role,
  avatarUrl: t.avatarUrl,
  isPublished: t.isPublished,
  featured: t.featured,
  order: t.order,
  createdAt: t.createdAt.toISOString(),
  updatedAt: t.updatedAt.toISOString(),
});

const ORDER: Prisma.TestimonialOrderByWithRelationInput[] = [{ order: "asc" }, { createdAt: "desc" }];

/** Marketing website testimonials: owner CRUD (Owner Console) + the published list for the website. */
@Injectable()
export class TestimonialsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListTestimonialsQueryDto): Promise<Paginated<TestimonialView>> {
    const where: Prisma.TestimonialWhereInput = {
      ...(q.status === "published" && { isPublished: true }),
      ...(q.status === "draft" && { isPublished: false }),
      ...(q.q && {
        OR: [
          { quote: { contains: q.q, mode: "insensitive" as const } },
          { name: { contains: q.q, mode: "insensitive" as const } },
          { role: { contains: q.q, mode: "insensitive" as const } },
        ],
      }),
    };
    const [rows, total] = await Promise.all([this.prisma.testimonial.findMany({ where, orderBy: ORDER, ...skipTake(q) }), this.prisma.testimonial.count({ where })]);
    return paginated(rows.map(toView), total, q);
  }

  async create(dto: TestimonialFormDto): Promise<TestimonialView> {
    return toView(await this.prisma.testimonial.create({ data: { ...dto, role: dto.role ?? "", avatarUrl: dto.avatarUrl ?? "" } }));
  }

  async update(id: string, dto: UpdateTestimonialDto): Promise<TestimonialView> {
    await this.mustFind(id);
    return toView(await this.prisma.testimonial.update({ where: { id }, data: dto }));
  }

  async remove(id: string): Promise<void> {
    await this.mustFind(id);
    await this.prisma.testimonial.delete({ where: { id } });
  }

  /** What the website shows: published only, in order (at most 12). */
  async published(): Promise<PublicTestimonial[]> {
    const rows = await this.prisma.testimonial.findMany({ where: { isPublished: true }, orderBy: ORDER, take: 12 });
    return rows.map(({ id, quote, name, role, avatarUrl, featured }) => ({ id, quote, name, role, avatarUrl, featured }));
  }

  private async mustFind(id: string) {
    const row = await this.prisma.testimonial.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw new NotFoundException("This testimonial no longer exists.");
  }
}
