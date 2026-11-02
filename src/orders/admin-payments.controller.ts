import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, RequireRoles, ValidateDto, type AuthUser } from "../common/auth-user";
import { RequirePermission } from "../team/permissions.guard";
import type { ActorContext } from "../team/services/team-access.service";
import { NoteId, OrderId } from "./admin-orders.controller";
import { ChangeStatusDto, CommerceNoteDto, EditPaymentDto, OrderFiltersDto, OrderQueryDto } from "./dto/orders.dto";
import { OrderAdminService } from "./services/order-admin.service";
import { OrdersQueryService } from "./services/orders-query.service";

/**
 * Admin panel › Payments: the money side of the same orders (confirm a pending payment, mark it failed,
 * refund it, edit payment details, payment notes). Refunds need the separate "Payments → Refund" permission.
 */
@ApiTags("Admin · Payments")
@Controller("admin/payments")
@RequireRoles("ADMIN")
@ValidateDto()
export class AdminPaymentsController {
  constructor(
    private readonly query: OrdersQueryService,
    private readonly admin: OrderAdminService,
  ) {}

  @Get()
  @RequirePermission("payments", "view")
  list(@CurrentUser() user: AuthUser, @Query() q: OrderQueryDto) {
    return this.query.list(user, q);
  }

  @Get("stats")
  @RequirePermission("payments", "view")
  stats(@CurrentUser() user: AuthUser, @Query() q: OrderFiltersDto) {
    return this.query.stats(user, q);
  }

  @Get(":id")
  @RequirePermission("payments", "view")
  detail(@CurrentUser() user: AuthUser, @OrderId() id: string) {
    return this.query.detail(user, id);
  }

  @Post(":id/status")
  @HttpCode(200)
  @RequirePermission("payments", "view")
  @ApiOperation({ summary: "Pending → Paid / Failed, Failed → Pending (Payments → Create & edit); Paid → Refunded (Payments → Refund)" })
  changeStatus(@CurrentUser() user: AuthUser, @OrderId() id: string, @Body() dto: ChangeStatusDto, @Req() req: { teamAccess: ActorContext }) {
    const needed = dto.target === "Refunded" ? "refund" : "manage";
    if (!req.teamAccess.permissions.payments.includes(needed))
      throw new ForbiddenException(`You need the "Payments → ${needed === "refund" ? "Refund" : "Create & edit"}" permission to do this.`);
    return this.admin.changeStatus(user, id, "payment", dto);
  }

  @Post(":id/verify")
  @HttpCode(200)
  @RequirePermission("payments", "manage")
  verify(@CurrentUser() user: AuthUser, @OrderId() id: string) {
    return this.admin.verify(user, id);
  }

  @Patch(":id")
  @RequirePermission("payments", "manage")
  @ApiOperation({ summary: "Edit payment method / masked account / reference (reference only once paid)" })
  editPayment(@CurrentUser() user: AuthUser, @OrderId() id: string, @Body() dto: EditPaymentDto) {
    return this.admin.editPayment(user, id, dto);
  }

  @Post(":id/receipt")
  @HttpCode(200)
  @RequirePermission("payments", "manage")
  sendReceipt(@CurrentUser() user: AuthUser, @OrderId() id: string) {
    return this.admin.sendReceipt(user, id);
  }

  // ---------------------------------------------------------------- notes (Payment page)

  @Post(":id/notes")
  @RequirePermission("payments", "manage")
  addNote(@CurrentUser() user: AuthUser, @OrderId() id: string, @Body() dto: CommerceNoteDto) {
    return this.admin.addNote(user, id, "PAYMENT", dto.content);
  }

  @Patch(":id/notes/:noteId")
  @RequirePermission("payments", "manage")
  updateNote(@CurrentUser() user: AuthUser, @OrderId() id: string, @NoteId() noteId: string, @Body() dto: CommerceNoteDto) {
    return this.admin.updateNote(user, id, "PAYMENT", noteId, dto.content);
  }

  @Delete(":id/notes/:noteId")
  @RequirePermission("payments", "manage")
  deleteNote(@CurrentUser() user: AuthUser, @OrderId() id: string, @NoteId() noteId: string) {
    return this.admin.deleteNote(user, id, "PAYMENT", noteId);
  }
}
