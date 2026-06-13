// src/app.module.ts
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { UserModule } from "./user/user.module";
import { Module } from "@nestjs/common";
import { CategoryModule } from "./category/category.module";
import { CourseModule } from "./course/course.module";
import { CourseModuleModule } from "./course-module/course-module.module";
import { LessonResourceModule } from "./lession-resource/lesson-resource.module";
import { LessonModule } from "./lession/lesson.module";
import { OrderModule } from "./order/order.module";
import { PaymentModule } from "./payment/payment.module";
import { LessonProgressModule } from "./lesson-progress/lesson-progress.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UserModule,
    CategoryModule,
    CourseModule,
    CourseModuleModule,
    LessonModule,
    LessonResourceModule,
    OrderModule,
    PaymentModule,
    LessonProgressModule,
  ],
})
export class AppModule {}
