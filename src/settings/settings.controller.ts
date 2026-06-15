import { Controller, Get, Patch, Body, UseGuards, Post } from "@nestjs/common";
import { SettingsService } from "./settings.service";
import { UpdateSettingDto } from "./dto/update-settings.dto";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";

@Controller("settings")
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Post("init")
  async create(@Body() data: UpdateSettingDto) {
    return await this.settingsService.createInitialSettings(data);
  }

  @Get()
  async get() {
    return this.settingsService.getSettings();
  }

  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Patch()
  @Roles("ADMIN")
  async update(@Body() data: UpdateSettingDto) {
    return this.settingsService.updateSettings(data);
  }
}
