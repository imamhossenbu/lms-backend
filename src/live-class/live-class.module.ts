// live-class.module.ts
import { Module } from "@nestjs/common";
import { LiveClassService } from "./live-class.service";
import { PrismaModule } from "../prisma/prisma.module";
import { LiveClassController } from "./live-class.controller";

@Module({
  imports: [PrismaModule],
  controllers: [LiveClassController],
  providers: [LiveClassService],
})
export class LiveClassModule {}
