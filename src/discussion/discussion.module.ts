import { Module } from "@nestjs/common";
import { CommunityModule } from "../community/community.module";
import { PrismaModule } from "../prisma/prisma.module";
import { DiscussionController } from "./discussion.controller";
import { DiscussionService } from "./discussion.service";

/** Student side of Community (/discussion). Shares CommunityModule's services and rules with /admin/community. */
@Module({
  imports: [PrismaModule, CommunityModule],
  controllers: [DiscussionController],
  providers: [DiscussionService],
})
export class DiscussionModule {}
