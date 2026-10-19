import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { CreateCourseDto, UpdateCourseDto } from "./dto/course.dto";
import { CourseQueryDto } from "./dto/course-query.dto";

@Injectable()
export class CourseService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
  ) {}

  async create(
    dto: CreateCourseDto,
    instructorId: string,
    file?: Express.Multer.File,
  ) {
    let thumbnailUrl: string | undefined = undefined;
    if (file) {
      thumbnailUrl = await this.cloudinary.uploadImage(file);
    }

    return await this.prisma.course.create({
      data: {
        ...dto,
        instructorId,
        thumbnail: thumbnailUrl,
        status: "DRAFT",
        price: Number(dto.price),
        durationMinutes: Number(dto.durationMinutes),
      },
    });
  }

  async findAll(query?: CourseQueryDto) {
    const page = Number(query?.page) || 1;
    const limit = Number(query?.limit) || 10;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query?.status) {
      where.status = query.status;
    }

    if (query?.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query?.level) {
      where.level = { contains: query.level, mode: "insensitive" };
    }

    if (typeof query?.isFree === "boolean") {
      where.isFree = query.isFree;
    }

    if (query?.minPrice !== undefined || query?.maxPrice !== undefined) {
      where.price = {};
      if (query.minPrice !== undefined) where.price.gte = Number(query.minPrice);
      if (query.maxPrice !== undefined) where.price.lte = Number(query.maxPrice);
    }

    if (query?.search) {
      where.OR = [
        { title: { contains: query.search, mode: "insensitive" } },
        { description: { contains: query.search, mode: "insensitive" } },
        { tags: { contains: query.search, mode: "insensitive" } },
      ];
    }

    let orderBy: any = { id: "desc" };
    if (query?.sortBy === "priceAsc") {
      orderBy = { price: "asc" };
    } else if (query?.sortBy === "priceDesc") {
      orderBy = { price: "desc" };
    } else if (query?.sortBy === "popular") {
      orderBy = { totalStudents: "desc" };
    } else if (query?.sortBy === "rating") {
      orderBy = { ratingAverage: "desc" };
    }

    const [courses, total] = await Promise.all([
      this.prisma.course.findMany({
        where,
        include: { category: true },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.course.count({ where }),
    ]);

    return {
      data: courses,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    return await this.prisma.course.findUnique({
      where: { id },
      include: {
        category: true,
        modules: {
          orderBy: { order: "asc" },
          include: {
            lessons: {
              orderBy: { order: "asc" },
              include: {
                lessonResources: true,
              },
            },
          },
        },
      },
    });
  }

  async update(
    id: string,
    instructorId: string,
    role: string,
    dto: UpdateCourseDto,
    file?: Express.Multer.File,
  ) {
    const course = await this.prisma.course.findUnique({ where: { id } });

    if (!course) throw new NotFoundException("Course not found");
    if (role !== "ADMIN" && course.instructorId !== instructorId) {
      throw new ForbiddenException(
        "You are not authorized to update this course",
      );
    }

    let thumbnailUrl: string | undefined = undefined;
    if (file) {
      thumbnailUrl = await this.cloudinary.uploadImage(file);
    }

    return await this.prisma.course.update({
      where: { id },
      data: {
        ...dto,

        ...(dto.price && { price: Number(dto.price) }),
        ...(dto.durationMinutes && {
          durationMinutes: Number(dto.durationMinutes),
        }),
        ...(thumbnailUrl && { thumbnail: thumbnailUrl }),
      },
    });
  }

  async delete(id: string, instructorId: string, role: string) {
    const course = await this.prisma.course.findUnique({ where: { id } });

    if (!course) throw new NotFoundException("Course not found");

    if (role !== "ADMIN" && course.instructorId !== instructorId) {
      throw new ForbiddenException(
        "You are not authorized to delete this course",
      );
    }

    return await this.prisma.course.delete({ where: { id } });
  }
}
