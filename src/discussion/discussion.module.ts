import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module";
import { DiscussionController } from "./discussion.controller";
import { DiscussionService } from "./discussion.service";

@Module({
  imports: [PrismaModule],
  controllers: [DiscussionController],
  providers: [DiscussionService],
})
export class DiscussionModule {}
