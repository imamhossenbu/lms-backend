import { Injectable } from "@nestjs/common";
import { UpdateAiSettingsDto } from "./dto/ai-settings.dto";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class AiSettingsService {
  constructor(private prisma: PrismaService) {}

  async getActiveSettings() {
    return await this.prisma.aiSettings.findFirst({
      where: { isActive: true },
    });
  }

  async updateSettings(data: UpdateAiSettingsDto) {
    const existing = await this.prisma.aiSettings.findFirst();

    if (existing) {
      return await this.prisma.aiSettings.update({
        where: { id: existing.id },
        data: data,
      });
    }

    // প্রথমবার সেভ করার জন্য
    return await this.prisma.aiSettings.create({
      data: {
        provider: data.provider || "groq",
        modelName: data.modelName || "llama3-70b-8192",
        baseUrl: data.baseUrl || "https://api.groq.com/openai/v1",
        maxTokens: data.maxTokens || 2048,
        temperature: data.temperature || 0.7,
        systemPrompt: data.systemPrompt || "You are an assistant",
        isActive: data.isActive ?? true,
      },
    });
  }
}
