import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ListEventsQueryDto, ListInvoicesQueryDto } from "../dto/subscription.dto";
import { PLATFORM_OWNER_ROLE } from "../saas.constants";
import { SaasInstitutionsService } from "../services/saas-institutions.service";
import { SaasInvoicesService } from "../services/saas-invoices.service";
import { RequireRoles, SaasValidation } from "./saas-controller.utils";

const Id = () => Param("id", new ParseUUIDPipe({ errorHttpStatusCode: 404 }));

/** Owner Console › store snapshot, invoices and activity timeline. */
@ApiTags("SaaS · Owner")
@Controller("saas/owner")
@RequireRoles(PLATFORM_OWNER_ROLE)
@SaasValidation()
export class OwnerBillingController {
  constructor(
    private readonly institutions: SaasInstitutionsService,
    private readonly invoices: SaasInvoicesService,
  ) {}

  @Get("snapshot")
  @ApiOperation({ summary: "Whole SaaS state ({ plans, institutions, invoices, events }) — same shape as the frontend SaasStore" })
  snapshot() {
    return this.institutions.snapshot();
  }

  @Get("events")
  events(@Query() q: ListEventsQueryDto) {
    return this.institutions.events(q.institutionId, q.limit);
  }

  @Get("invoices")
  listInvoices(@Query() q: ListInvoicesQueryDto) {
    return this.invoices.list(q);
  }

  @Post("invoices/:id/retry")
  @HttpCode(200)
  retry(@Id() id: string) {
    return this.invoices.retry(id, "Owner");
  }

  @Post("invoices/:id/refund")
  @HttpCode(200)
  refund(@Id() id: string) {
    return this.invoices.refund(id);
  }

  @Post("invoices/:id/mark-paid")
  @HttpCode(200)
  markPaid(@Id() id: string) {
    return this.invoices.markPaid(id);
  }

  @Post("invoices/:id/void")
  @HttpCode(200)
  void(@Id() id: string) {
    return this.invoices.void(id);
  }
}
