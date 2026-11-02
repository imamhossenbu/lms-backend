import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { AddNoteDto, CreateInstitutionDto, SlugAvailabilityQueryDto, UpdateInstitutionDto } from "../dto/institution.dto";
import {
  CancelSubscriptionDto,
  ChangePlanDto,
  ConvertTrialDto,
  CustomDomainDto,
  ExtendTrialDto,
  PaymentMethodDto,
  SuspendInstitutionDto,
} from "../dto/subscription.dto";
import { PLATFORM_OWNER_ROLE } from "../saas.constants";
import { SaasDomainsService } from "../services/saas-domains.service";
import { SaasInstitutionsService } from "../services/saas-institutions.service";
import { SaasSubscriptionService } from "../services/saas-subscription.service";
import { CurrentUser, RequireRoles, SaasValidation, type AuthUser } from "./saas-controller.utils";

const Id = () => Param("id", new ParseUUIDPipe({ errorHttpStatusCode: 404 }));

/** Owner Console › Institutions (details, subscription actions, domains, impersonation). */
@ApiTags("SaaS · Owner")
@Controller("saas/owner/institutions")
@RequireRoles(PLATFORM_OWNER_ROLE)
@SaasValidation()
export class OwnerInstitutionsController {
  constructor(
    private readonly institutions: SaasInstitutionsService,
    private readonly subscriptions: SaasSubscriptionService,
    private readonly domains: SaasDomainsService,
  ) {}

  // ---------------------------------------------------------------- institutions

  @Get()
  list() {
    return this.institutions.list();
  }

  @Get("slug-availability")
  slugAvailability(@Query() q: SlugAvailabilityQueryDto) {
    return this.institutions.checkSlug(q.slug, q.exceptId);
  }

  @Get(":id")
  @ApiOperation({ summary: "Institution with its invoices and timeline" })
  detail(@Id() id: string) {
    return this.institutions.detail(id);
  }

  @Post()
  @ApiOperation({ summary: "Create an institution (trial, or active with an open first invoice)" })
  create(@Body() dto: CreateInstitutionDto) {
    return this.institutions.create(dto);
  }

  @Patch(":id")
  update(@Id() id: string, @Body() dto: UpdateInstitutionDto) {
    return this.institutions.update(id, dto);
  }

  @Post(":id/notes")
  addNote(@Id() id: string, @Body() dto: AddNoteDto) {
    return this.institutions.addNote(id, dto.note);
  }

  @Post(":id/impersonate")
  @HttpCode(200)
  @ApiOperation({ summary: "1-hour ADMIN token for opening the institution panel as owner" })
  impersonate(@Id() id: string, @CurrentUser() user: AuthUser) {
    return this.institutions.impersonate(id, user);
  }

  // ---------------------------------------------------------------- subscription

  @Get(":id/plan-preview")
  @ApiOperation({ summary: "Preview charge / blockers of a plan change" })
  preview(@Id() id: string, @Query() q: ChangePlanDto) {
    return this.subscriptions.preview(id, q.planId, q.cycle);
  }

  @Post(":id/change-plan")
  @HttpCode(200)
  changePlan(@Id() id: string, @Body() dto: ChangePlanDto) {
    return this.subscriptions.changePlan(id, dto.planId, dto.cycle, "Owner");
  }

  @Post(":id/cancel")
  @HttpCode(200)
  cancel(@Id() id: string, @Body() dto: CancelSubscriptionDto) {
    return this.subscriptions.cancel(id, dto.atPeriodEnd, "Owner");
  }

  @Post(":id/reactivate")
  @HttpCode(200)
  reactivate(@Id() id: string) {
    return this.subscriptions.reactivate(id, "Owner");
  }

  @Post(":id/suspend")
  @HttpCode(200)
  suspend(@Id() id: string, @Body() dto: SuspendInstitutionDto) {
    return this.subscriptions.suspend(id, dto.reason);
  }

  @Post(":id/unsuspend")
  @HttpCode(200)
  unsuspend(@Id() id: string) {
    return this.subscriptions.unsuspend(id);
  }

  @Post(":id/extend-trial")
  @HttpCode(200)
  extendTrial(@Id() id: string, @Body() dto: ExtendTrialDto) {
    return this.subscriptions.extendTrial(id, dto.days);
  }

  @Post(":id/convert-trial")
  @HttpCode(200)
  convertTrial(@Id() id: string, @Body() dto: ConvertTrialDto) {
    return this.subscriptions.convertTrial(id, dto.planId, dto.cycle, dto.paymentMethod, "Owner");
  }

  @Patch(":id/payment-method")
  updatePaymentMethod(@Id() id: string, @Body() dto: PaymentMethodDto) {
    return this.subscriptions.updatePaymentMethod(id, dto, "Owner");
  }

  // ---------------------------------------------------------------- custom domain

  @Post(":id/domain")
  addDomain(@Id() id: string, @Body() dto: CustomDomainDto) {
    return this.domains.add(id, dto.domain, "Owner");
  }

  @Post(":id/domain/verify")
  @HttpCode(200)
  verifyDomain(@Id() id: string) {
    return this.domains.verify(id);
  }

  @Delete(":id/domain")
  removeDomain(@Id() id: string) {
    return this.domains.remove(id, "Owner");
  }
}
