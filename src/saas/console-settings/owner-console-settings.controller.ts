import { Body, Controller, Get, HttpCode, Patch, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, RequireRoles, SaasValidation, type AuthUser } from "../controllers/saas-controller.utils";
import { PLATFORM_OWNER_ROLE } from "../saas.constants";
import { BillingSettingsDto, CompanySettingsDto, ConsoleTestEmailDto, EmailSettingsDto, TrialsSettingsDto } from "./dto/console-settings.dto";
import { ConsoleSettingsService } from "./services/console-settings.service";

/**
 * Owner Console › Settings. GET returns the console's ConsoleSettingsStore; each section is saved whole with its own
 * PATCH (gateway `secretKey`: "" = keep the stored value; responses only carry masked `secretHints`).
 */
@ApiTags("SaaS · Owner")
@Controller("saas/owner/console-settings")
@RequireRoles(PLATFORM_OWNER_ROLE)
@SaasValidation()
export class OwnerConsoleSettingsController {
  constructor(private readonly settings: ConsoleSettingsService) {}

  @Get()
  @ApiOperation({ summary: "All sections (defaults when never saved), masked secret hints and per-section last-saved times" })
  get() {
    return this.settings.store();
  }

  @Patch("company")
  company(@CurrentUser() user: AuthUser, @Body() dto: CompanySettingsDto) {
    return this.settings.save("company", dto, user.userId);
  }

  @Patch("billing")
  @ApiOperation({ summary: "invoicePrefix numbers new SaaS invoices; taxRate applies to countries without a specific rate" })
  billing(@CurrentUser() user: AuthUser, @Body() dto: BillingSettingsDto) {
    return this.settings.save("billing", dto, user.userId);
  }

  @Patch("trials")
  @ApiOperation({ summary: "defaultTrialDays is the self-signup fallback when a plan has no trial length" })
  trials(@CurrentUser() user: AuthUser, @Body() dto: TrialsSettingsDto) {
    return this.settings.save("trials", dto, user.userId);
  }

  @Patch("email")
  email(@CurrentUser() user: AuthUser, @Body() dto: EmailSettingsDto) {
    return this.settings.save("email", dto, user.userId);
  }

  @Post("email/test")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  testEmail(@CurrentUser() user: AuthUser, @Body() dto: ConsoleTestEmailDto) {
    return this.settings.sendTestEmail(dto.to, user.email);
  }
}
