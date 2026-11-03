// src/app.module.ts
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
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
import { QuizModule } from "./quiz/quiz.module";
import { AssignmentModule } from "./assignment/assignment.module";
import { CouponModule } from "./coupon/coupon.module";
import { CommunityModule } from "./community/community.module";
import { DiscussionModule } from "./discussion/discussion.module";
import { ReviewModule } from "./review/review.module";
import { CertificateModule } from "./certificate/certificate.module";
import { NotificationModule } from "./notification/notification.module";
import { AnnouncementModule } from "./announcement/announcement.module";
import { LiveClassModule } from "./live-class/live-class.module";
import { AttendanceModule } from "./attendance/attendance.module";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { ActivityLogInterceptor } from "./activity-log/activity-log.interceptor";
import { ActivityLogModule } from "./activity-log/activity-log.module";
import { SettingsModule } from "./settings/settings.module";
import { AiSettingsModule } from "./ai/ai-settings/ai-settings.module";
import { AiModule } from "./ai/ai-service/ai.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";

import { EnrollmentModule } from "./enrollment/enrollment.module";
import { SaasModule } from "./saas/saas.module";
import { StudentsModule } from "./students/students.module";
import { InstructorsModule } from "./instructors/instructors.module";
import { TeamModule } from "./team/team.module";
import { OrdersModule } from "./orders/orders.module";
import { AssignmentsModule } from "./assignments/assignments.module";
import { QuizzesModule } from "./quizzes/quizzes.module";
import { LiveClassesModule } from "./live-classes/live-classes.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 120, // 120 requests per minute per IP
      },
    ]),
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
    EnrollmentModule,
    LessonProgressModule,
    QuizModule,
    AssignmentModule,
    CouponModule,
    DiscussionModule,
    CommunityModule,
    ReviewModule,
    CertificateModule,
    NotificationModule,
    AnnouncementModule,
    LiveClassModule,
    AttendanceModule,
    ActivityLogModule,
    SettingsModule,
    AiSettingsModule,
    AiModule,
    AnalyticsModule,
    SaasModule,
    StudentsModule,
    InstructorsModule,
    TeamModule,
    OrdersModule,
    AssignmentsModule,
    QuizzesModule,
    LiveClassesModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: ActivityLogInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
