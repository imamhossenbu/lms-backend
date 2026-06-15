import { Controller, Get, Patch, Body, UseGuards, Post } from "@nestjs/common";
import { AiSettingsService } from "./ai-settings.service";
import { UpdateAiSettingsDto } from "./dto/ai-settings.dto";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";

@Controller("ai-settings")
export class AiSettingsController {
  constructor(private readonly aiSettingsService: AiSettingsService) {}

  @Get()
  async get() {
    return await this.aiSettingsService.getActiveSettings();
  }

  @Post()
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN")
  async create(@Body() data: UpdateAiSettingsDto) {
    return await this.aiSettingsService.createSettings(data);
  }

  @Patch()
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN")
  async update(@Body() data: UpdateAiSettingsDto) {
    return await this.aiSettingsService.updateSettings(data);
  }
}
