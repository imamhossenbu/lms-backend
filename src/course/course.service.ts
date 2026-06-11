import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { CreateCourseDto, UpdateCourseDto } from "./dto/course.dto";

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

  async findAll() {
    return await this.prisma.course.findMany({ include: { category: true } });
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
