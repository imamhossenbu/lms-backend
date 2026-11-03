import { Module } from "@nestjs/common";
import { LiveClassesModule } from "../live-classes/live-classes.module";
import { PrismaModule } from "../prisma/prisma.module";
import { LiveClassController } from "./live-class.controller";
import { LiveClassService } from "./live-class.service";

/** Student side of live classes (/live-class). Admins manage classes at /admin/live-classes. */
@Module({
  imports: [PrismaModule, LiveClassesModule],
  controllers: [LiveClassController],
  providers: [LiveClassService],
  exports: [LiveClassService],
})
export class LiveClassModule {}
