import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, RequireRoles, ValidateDto, type AuthUser } from "../common/auth-user";
import { RequirePermission } from "../team/permissions.guard";
import { AdditionalInfoDto, ChangeStatusDto, CommerceNoteDto, CreateOrderDto, OrderFiltersDto, OrderQueryDto } from "./dto/orders.dto";
import { OrderAdminService } from "./services/order-admin.service";
import { OrdersQueryService } from "./services/orders-query.service";

export const OrderId = () => Param("id", new ParseUUIDPipe({ errorHttpStatusCode: 404 }));
export const NoteId = () => Param("noteId", new ParseUUIDPipe({ errorHttpStatusCode: 404 }));

/**
 * Admin panel › Orders: manage the order itself (create manual orders, confirm / fail / cancel / reopen,
 * verify with the gateway, additional info, internal notes, receipts). Refunds live under /admin/payments.
 */
@ApiTags("Admin · Orders")
@Controller("admin/orders")
@RequireRoles("ADMIN")
@ValidateDto()
export class AdminOrdersController {
  constructor(
    private readonly query: OrdersQueryService,
    private readonly admin: OrderAdminService,
  ) {}

  @Get()
  @RequirePermission("orders", "view")
  @ApiOperation({ summary: "Paginated orders with search, status, course, method and date filters" })
  list(@CurrentUser() user: AuthUser, @Query() q: OrderQueryDto) {
    return this.query.list(user, q);
  }

  @Get("stats")
  @RequirePermission("orders", "view")
  @ApiOperation({ summary: "Stat cards (totals per status + revenue) for the same filters" })
  stats(@CurrentUser() user: AuthUser, @Query() q: OrderFiltersDto) {
    return this.query.stats(user, q);
  }

  @Get(":id")
  @RequirePermission("orders", "view")
  @ApiOperation({ summary: "Order with timeline, notes and invoice" })
  detail(@CurrentUser() user: AuthUser, @OrderId() id: string) {
    return this.query.detail(user, id);
  }

  @Post()
  @RequirePermission("orders", "manage")
  @ApiOperation({ summary: "Create a manual order (offline payment), optionally already paid" })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto, @Req() req: any) {
    return this.admin.create(user, dto, { ip: req.ip });
  }

  @Post(":id/status")
  @HttpCode(200)
  @RequirePermission("orders", "manage")
  @ApiOperation({ summary: "Change status: Pending → Paid / Failed / Cancelled, Failed → Pending / Cancelled, Cancelled → Pending" })
  changeStatus(@CurrentUser() user: AuthUser, @OrderId() id: string, @Body() dto: ChangeStatusDto) {
    return this.admin.changeStatus(user, id, "order", dto);
  }

  @Post(":id/verify")
  @HttpCode(200)
  @RequirePermission("orders", "manage")
  @ApiOperation({ summary: "Ask SSLCommerz whether this pending order was paid; marks it paid if so" })
  verify(@CurrentUser() user: AuthUser, @OrderId() id: string) {
    return this.admin.verify(user, id);
  }

  @Patch(":id/additional-info")
  @RequirePermission("orders", "manage")
  additionalInfo(@CurrentUser() user: AuthUser, @OrderId() id: string, @Body() dto: AdditionalInfoDto) {
    return this.admin.updateAdditionalInfo(user, id, dto);
  }

  @Get(":id/invoice")
  @RequirePermission("orders", "view")
  @ApiOperation({ summary: "Invoice PDF URL (generated on first request)" })
  invoice(@CurrentUser() user: AuthUser, @OrderId() id: string) {
    return this.admin.invoiceUrl(user, id);
  }

  @Post(":id/receipt")
  @HttpCode(200)
  @RequirePermission("orders", "manage")
  @ApiOperation({ summary: "Email the receipt / invoice to the student" })
  sendReceipt(@CurrentUser() user: AuthUser, @OrderId() id: string) {
    return this.admin.sendReceipt(user, id);
  }

  // ---------------------------------------------------------------- notes (Order page)

  @Post(":id/notes")
  @RequirePermission("orders", "manage")
  addNote(@CurrentUser() user: AuthUser, @OrderId() id: string, @Body() dto: CommerceNoteDto) {
    return this.admin.addNote(user, id, "ORDER", dto.content);
  }

  @Patch(":id/notes/:noteId")
  @RequirePermission("orders", "manage")
  updateNote(@CurrentUser() user: AuthUser, @OrderId() id: string, @NoteId() noteId: string, @Body() dto: CommerceNoteDto) {
    return this.admin.updateNote(user, id, "ORDER", noteId, dto.content);
  }

  @Delete(":id/notes/:noteId")
  @RequirePermission("orders", "manage")
  deleteNote(@CurrentUser() user: AuthUser, @OrderId() id: string, @NoteId() noteId: string) {
    return this.admin.deleteNote(user, id, "ORDER", noteId);
  }
}
