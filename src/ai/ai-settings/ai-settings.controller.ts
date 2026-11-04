import {
  Controller,
  Get,
  Body,
  UseGuards,
  Post,
  Patch,
  Param,
} from "@nestjs/common";
import { AiSettingsService } from "./ai-settings.service";
import {
  CreateAiSettingsDto,
  UpdateAiSettingsDto,
} from "./dto/ai-settings.dto";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { ValidateDto } from "../../common/auth-user";

/**
 * Platform-wide AI feature settings (one row shared by every workspace) — only the platform owner may change them.
 */
@Controller("ai-settings")
@ValidateDto()
export class AiSettingsController {
  constructor(private readonly aiSettingsService: AiSettingsService) {}

  @Get()
  async get() {
    return await this.aiSettingsService.getAllSettings();
  }

  @Post()
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("SUPER_ADMIN")
  async save(@Body() data: CreateAiSettingsDto) {
    return await this.aiSettingsService.saveFeature(data);
  }

  @Patch(":featureKey")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("SUPER_ADMIN")
  async update(
    @Param("featureKey") featureKey: string,
    @Body() data: UpdateAiSettingsDto,
  ) {
    return await this.aiSettingsService.updateFeature(featureKey, data.config);
  }
}
