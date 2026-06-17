import { Controller, Get, Patch, Body, UseGuards, Post } from "@nestjs/common";
import { SettingsService } from "./settings.service";
import { CreateSettingDto, UpdateSettingDto } from "./dto/settings.dto";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";

@Controller("settings")
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}


  @Post()
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN")
  async create(@Body() createDto: CreateSettingDto) {
    return await this.settingsService.createSettings(createDto);
  }


  @Get()
  async get() {
    return this.settingsService.getSettings();
  }


  @Patch()
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN")
  async update(@Body() data: UpdateSettingDto) {
    return await this.settingsService.updateSettings(data);
  }
}
