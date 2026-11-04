import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { CreateLessonResourceDto, UpdateLessonResourceDto } from "./dto/resource.dto";

@Injectable()
export class LessonResourceService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
  ) {}

  async create(
    lessonId: string,
    dto: CreateLessonResourceDto,
    file?: Express.Multer.File,
  ) {
    if (!file) {
      // Already hosted file (POST /courses/upload-media) or an external link.
      if (!dto.fileUrl) throw new BadRequestException("Upload a file or send a fileUrl.");
      return await this.prisma.lessonResource.create({
        data: {
          title: dto.title,
          fileUrl: dto.fileUrl,
          fileType: dto.fileType || "FILE",
          size: dto.size || "",
          lessonId,
          isDownloadable: dto.isDownloadable !== false,
        },
      });
    }

    // Cloudinary upload
    const uploadResult = await this.cloudinary.uploadFile(file);
    const fileUrl = (uploadResult as any).secure_url || uploadResult;

    const durationInSeconds = (uploadResult as any).duration || 0;
    const durationInMinutes = Math.round(durationInSeconds / 60);

    if (file.mimetype.startsWith("video/")) {
      await this.prisma.lesson.update({
        where: { id: lessonId },
        data: { durationMinutes: durationInMinutes },
      });
    }

    return await this.prisma.lessonResource.create({
      data: {
        title: dto.title,
        fileUrl,
        fileType: file.mimetype,
        size: (file.size / 1024 / 1024).toFixed(2) + " MB",
        lessonId,
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
    dto: UpdateLessonResourceDto,
    file?: Express.Multer.File,
  ) {
    const existing = await this.prisma.lessonResource.findUnique({
      where: { id },
      include: { lesson: true },
    });
    if (!existing) throw new NotFoundException("Resource not found");

    let updateData: any = { ...dto };

    if (file) {
      const uploadResult = await this.cloudinary.uploadFile(file);
      updateData.fileUrl = (uploadResult as any).secure_url || uploadResult;
      updateData.fileType = file.mimetype;
      updateData.size = (file.size / 1024 / 1024).toFixed(2) + " MB";

      if (file.mimetype.startsWith("video/")) {
        const durationInSeconds = (uploadResult as any).duration || 0;
        await this.prisma.lesson.update({
          where: { id: existing.lessonId },
          data: { durationMinutes: Math.round(durationInSeconds / 60) },
        });
      }
    }

    if (dto.isDownloadable !== undefined) {
      updateData.isDownloadable = String(dto.isDownloadable) !== "false";
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

