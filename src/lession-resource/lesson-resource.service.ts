import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { CreateLessonResourceDto } from "./dto/resource.dto";

@Injectable()
export class LessonResourceService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
  ) {}

  async create(
    lessonId: string,
    dto: CreateLessonResourceDto,
    file: Express.Multer.File,
  ) {
    const fileUrl = await this.cloudinary.uploadFile(file);

    return await this.prisma.lessonResource.create({
      data: {
        ...dto,
        fileUrl,
        lessonId,
        size: (file.size / 1024 / 1024).toFixed(2) + " MB",
        isDownloadable: String(dto.isDownloadable) !== "false",
      },
    });
  }

  async findAllByLesson(lessonId: string) {
    return await this.prisma.lessonResource.findMany({
      where: { lessonId },
    });
  }

  async update(
    id: string,
    dto: Partial<CreateLessonResourceDto>,
    file?: Express.Multer.File,
  ) {
    const existing = await this.prisma.lessonResource.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException("Resource not found");

    let updateData: any = { ...dto };

   
    if (dto.isDownloadable !== undefined) {
      updateData.isDownloadable = String(dto.isDownloadable) !== "false";
    }

    if (file) {
      const fileUrl = await this.cloudinary.uploadFile(file);
      updateData.fileUrl = fileUrl;
      updateData.size = (file.size / 1024 / 1024).toFixed(2) + " MB";
    }

    return await this.prisma.lessonResource.update({
      where: { id },
      data: updateData,
    });
  }

  async delete(id: string) {
    return await this.prisma.lessonResource.delete({ where: { id } });
  }
}
