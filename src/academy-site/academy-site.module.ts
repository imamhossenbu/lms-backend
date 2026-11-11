import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { WorkspaceSettingsModule } from "../workspace-settings/workspace-settings.module";
import { AcademySiteService } from "./academy-site.service";
import { PublicAcademyController } from "./public-academy.controller";

/**
 * Public data for each academy's own website (lms-academy-site, port 3003):
 *   GET /academy/public/resolve?host=      host → slug (subdomain of ACADEMY_ROOT_DOMAIN or verified custom domain)
 *   GET /academy/public/:slug              profile + branding + stats + categories
 *   GET /academy/public/:slug/courses      published catalogue      GET …/courses/:courseSlug  course page
 *   GET /academy/public/:slug/levels       filter options           GET …/instructors, …/reviews
 */
@Module({
  imports: [PrismaModule, WorkspaceSettingsModule],
  controllers: [PublicAcademyController],
  providers: [AcademySiteService],
})
export class AcademySiteModule {}
