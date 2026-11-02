import { Body, Controller, Get, Param, Patch, Post, Put } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ArchivePlanDto, PlanDto } from "../dto/plan.dto";
import { PLATFORM_OWNER_ROLE } from "../saas.constants";
import { SaasPlansService } from "../services/saas-plans.service";
import { RequireRoles, SaasValidation } from "./saas-controller.utils";

/** Owner Console › Plans & pricing. */
@ApiTags("SaaS · Owner")
@Controller("saas/owner/plans")
@RequireRoles(PLATFORM_OWNER_ROLE)
@SaasValidation()
export class OwnerPlansController {
  constructor(private readonly plans: SaasPlansService) {}

  @Get()
  @ApiOperation({ summary: "All plans (incl. archived / private), canonical order" })
  list() {
    return this.plans.list();
  }

  @Get("subscribers")
  @ApiOperation({ summary: "Non-cancelled institutions per plan id" })
  subscribers() {
    return this.plans.subscriberCounts();
  }

  @Post()
  @ApiOperation({ summary: "Create a custom plan (id plan-<slug>)" })
  create(@Body() dto: PlanDto) {
    return this.plans.create(dto);
  }

  @Put(":id")
  @ApiOperation({ summary: "Update a plan (full plan editor payload)" })
  update(@Param("id") id: string, @Body() dto: PlanDto) {
    return this.plans.update(id, dto);
  }

  @Patch(":id/archive")
  @ApiOperation({ summary: "Archive / unarchive a plan" })
  archive(@Param("id") id: string, @Body() dto: ArchivePlanDto) {
    return this.plans.setArchived(id, dto.archived);
  }
}
