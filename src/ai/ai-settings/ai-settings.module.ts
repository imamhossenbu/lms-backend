import { Module } from "@nestjs/common";
import { AiSettingsService } from "./ai-settings.service";
import { AiSettingsController } from "./ai-settings.controller";
import { PrismaModule } from "../../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [AiSettingsController],
  providers: [AiSettingsService],
  exports: [AiSettingsService],
})
export class AiSettingsModule {}
