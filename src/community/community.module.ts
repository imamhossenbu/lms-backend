import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AdminCommunityController } from "./admin-community.controller";
import { CommunityAdminService } from "./services/community-admin.service";
import { CommunityQueryService } from "./services/community-query.service";
import { CommunityRepliesService } from "./services/community-replies.service";
import { CommunityThreadsService } from "./services/community-threads.service";

/**
 * Admin panel › Community (/admin/community). Students use the legacy DiscussionModule (/discussion), which writes
 * through the same thread / reply services and rules.
 */
@Module({
  imports: [PrismaModule],
  controllers: [AdminCommunityController],
  providers: [CommunityQueryService, CommunityThreadsService, CommunityRepliesService, CommunityAdminService],
  exports: [CommunityQueryService, CommunityThreadsService, CommunityRepliesService],
})
export class CommunityModule {}
