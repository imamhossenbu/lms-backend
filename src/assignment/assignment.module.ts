import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { MulterModule } from "@nestjs/platform-express";
import { memoryStorage } from "multer"; // diskStorage বাদ দিয়ে memoryStorage
import { AssignmentController } from "./assignment.controller";
import { AssignmentService } from "./assignment.service";
import { CloudinaryService } from "../cloudinary/cloudinary.service"; 
@Module({
  imports: [
    PrismaModule,
    MulterModule.register({
      storage: memoryStorage(),
    }),
  ],
  controllers: [AssignmentController],
  providers: [AssignmentService, CloudinaryService],
})
export class AssignmentModule {}
