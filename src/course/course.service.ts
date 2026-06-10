import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { CreateCourseDto } from "./dto/course.dto";

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
      },
    });
  }

  async findAll() {
    return await this.prisma.course.findMany({ include: { category: true } });
  }
}
