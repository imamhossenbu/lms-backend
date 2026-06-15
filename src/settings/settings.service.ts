import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateSettingDto, UpdateSettingDto } from "./dto/settings.dto";

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async createSettings(data: CreateSettingDto) {
    const existing = await this.prisma.setting.findFirst();

    if (existing) {
      return await this.prisma.setting.update({
        where: { id: existing.id },
        data: data,
      });
    }

    return await this.prisma.setting.create({
      data: {
        ...data,
        allowRegistration: data.allowRegistration ?? true,
        maintenanceMode: data.maintenanceMode ?? false,
      },
    });
  }

  async getSettings() {
    let settings = await this.prisma.setting.findFirst();
    if (!settings) {
      settings = await this.prisma.setting.create({
        data: { siteName: "My LMS" },
      });
    }
    return settings;
  }

  async updateSettings(data: UpdateSettingDto) {
    const current = await this.getSettings();
    return await this.prisma.setting.update({
      where: { id: current.id },
      data: data,
    });
  }
}
