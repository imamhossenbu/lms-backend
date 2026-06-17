import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import {
  CreateAiSettingsDto,
  UpdateAiSettingsDto,
} from "./dto/ai-settings.dto";
import { Prisma } from "../../../generated/prisma";

@Injectable()
export class AiSettingsService {
  constructor(private prisma: PrismaService) {}

  async getAllSettings() {
    return await this.prisma.aiSettings.findFirst();
  }

  async saveFeature(data: CreateAiSettingsDto) {
    let record = await this.prisma.aiSettings.findFirst();
    const currentSettings = (record?.settings as Record<string, any>) || {};

    currentSettings[data.featureKey] = data.config;

    if (!record) {
      return await this.prisma.aiSettings.create({
        data: { settings: currentSettings as Prisma.InputJsonValue },
      });
    }

    return await this.prisma.aiSettings.update({
      where: { id: record.id },
      data: { settings: currentSettings as Prisma.InputJsonValue },
    });
  }

  async updateFeature(featureKey: string, config: any) {
    const record = await this.prisma.aiSettings.findFirst();

    if (!record) {
      throw new NotFoundException("Settings not found. Create settings first.");
    }

    const currentSettings = record.settings as Record<string, any>;

    if (!currentSettings[featureKey]) {
      throw new NotFoundException(`Feature '${featureKey}' not found.`);
    }

    currentSettings[featureKey] = config;

    return await this.prisma.aiSettings.update({
      where: { id: record.id },
      data: { settings: currentSettings as Prisma.InputJsonValue },
    });
  }
}
