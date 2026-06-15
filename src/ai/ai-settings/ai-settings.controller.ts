import { Controller, Get, Patch, Body, UseGuards } from "@nestjs/common";
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

  @Patch()
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN")
  async update(@Body() data: UpdateAiSettingsDto) {
    return await this.aiSettingsService.updateSettings(data);
  }
}
