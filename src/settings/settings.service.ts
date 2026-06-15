import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateSettingDto } from "./dto/update-settings.dto";


@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

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
