import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { SettingsService } from "./settings.service";

/**
 * Legacy global site settings (the `settings` table) — public read only, kept for older clients.
 * Editing moved to the per-workspace Admin › Settings API (/admin/settings, src/workspace-settings);
 * new clients should read /settings/public.
 */
@ApiTags("Settings")
@Controller("settings")
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: "Legacy site settings (deprecated — use /settings/public)", deprecated: true })
  get() {
    return this.settingsService.getSettings();
  }
}
