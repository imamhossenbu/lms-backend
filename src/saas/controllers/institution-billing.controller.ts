import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CancelSubscriptionDto, ChangePlanDto, ConvertTrialDto, CustomDomainDto, PaymentMethodDto } from "../dto/subscription.dto";
import { INSTITUTION_ADMIN_ROLE } from "../saas.constants";
import { SaasDomainsService } from "../services/saas-domains.service";
import { SaasInstitutionsService } from "../services/saas-institutions.service";
import { SaasInvoicesService } from "../services/saas-invoices.service";
import { SaasPlansService } from "../services/saas-plans.service";
import { SaasSubscriptionService } from "../services/saas-subscription.service";
import { CurrentUser, RequireRoles, SaasValidation, type AuthUser } from "./saas-controller.utils";

/**
 * Institution admin panel › Billing & Plan + Settings › Domain. Always scoped to the caller's own institution
 * (from the JWT `institutionId` claim or the user's `institutionId` column) — never an id from the URL.
 */
@ApiTags("SaaS · Institution")
@Controller("saas/me")
@RequireRoles(INSTITUTION_ADMIN_ROLE)
@SaasValidation()
export class InstitutionBillingController {
  constructor(
    private readonly institutions: SaasInstitutionsService,
    private readonly plans: SaasPlansService,
    private readonly subscriptions: SaasSubscriptionService,
    private readonly invoices: SaasInvoicesService,
    private readonly domains: SaasDomainsService,
  ) {}

  private tenant(user: AuthUser) {
    return this.institutions.institutionIdFor(user);
  }

  @Get()
  @ApiOperation({ summary: "My institution + invoices + timeline + plans I can pick" })
  async me(@CurrentUser() user: AuthUser) {
    const id = await this.tenant(user);
    const [detail, plans] = await Promise.all([this.institutions.detail(id), this.plans.list()]);
    // Pickers show public, non-archived plans plus the one I'm currently on (even if private / archived).
    const visible = plans.filter((p) => (p.isPublic && !p.archived) || p.id === detail.institution.subscription.planId);
    return { ...detail, plans: visible, impersonatedBy: user.impersonatedBy ?? null };
  }

  @Get("plan-preview")
  async preview(@CurrentUser() user: AuthUser, @Query() q: ChangePlanDto) {
    return this.subscriptions.preview(await this.tenant(user), q.planId, q.cycle);
  }

  @Post("change-plan")
  @HttpCode(200)
  async changePlan(@CurrentUser() user: AuthUser, @Body() dto: ChangePlanDto) {
    return this.subscriptions.changePlan(await this.tenant(user), dto.planId, dto.cycle, "Institution", dto.couponCode);
  }

  @Post("cancel")
  @HttpCode(200)
  async cancel(@CurrentUser() user: AuthUser, @Body() dto: CancelSubscriptionDto) {
    return this.subscriptions.cancel(await this.tenant(user), dto.atPeriodEnd, "Institution");
  }

  @Post("reactivate")
  @HttpCode(200)
  async reactivate(@CurrentUser() user: AuthUser) {
    return this.subscriptions.reactivate(await this.tenant(user), "Institution");
  }

  @Post("convert-trial")
  @HttpCode(200)
  async convertTrial(@CurrentUser() user: AuthUser, @Body() dto: ConvertTrialDto) {
    return this.subscriptions.convertTrial(await this.tenant(user), dto.planId, dto.cycle, dto.paymentMethod, "Institution", dto.couponCode);
  }

  @Patch("payment-method")
  async updatePaymentMethod(@CurrentUser() user: AuthUser, @Body() dto: PaymentMethodDto) {
    return this.subscriptions.updatePaymentMethod(await this.tenant(user), dto, "Institution");
  }

  @Post("invoices/:id/pay")
  @HttpCode(200)
  @ApiOperation({ summary: "Pay an open / failed invoice with the card on file" })
  async payInvoice(@CurrentUser() user: AuthUser, @Param("id", new ParseUUIDPipe({ errorHttpStatusCode: 404 })) invoiceId: string) {
    await this.invoices.assertOwnedBy(invoiceId, await this.tenant(user));
    return this.invoices.retry(invoiceId, "Institution");
  }

  @Post("domain")
  async addDomain(@CurrentUser() user: AuthUser, @Body() dto: CustomDomainDto) {
    return this.domains.add(await this.tenant(user), dto.domain, "Institution");
  }

  @Post("domain/verify")
  @HttpCode(200)
  async verifyDomain(@CurrentUser() user: AuthUser) {
    return this.domains.verify(await this.tenant(user));
  }

  @Delete("domain")
  async removeDomain(@CurrentUser() user: AuthUser) {
    return this.domains.remove(await this.tenant(user), "Institution");
  }
}
