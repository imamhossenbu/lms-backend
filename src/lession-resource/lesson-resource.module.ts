import { Module } from "@nestjs/common";
import { LessonResourceService } from "./lesson-resource.service";
import { LessonResourceController } from "./lesson-resource.controller";
import { PrismaModule } from "../prisma/prisma.module";
import { CloudinaryService } from "../cloudinary/cloudinary.service";

@Module({
  imports: [PrismaModule],
  controllers: [LessonResourceController],
  providers: [LessonResourceService, CloudinaryService],
})
export class LessonResourceModule {}
