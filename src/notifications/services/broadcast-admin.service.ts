import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AuthUser } from "../../common/auth-user";
import { sanitizeRichText } from "../../common/html";
import { PrismaService } from "../../prisma/prisma.service";
import type { SaveBroadcastDto, TestBroadcastDto } from "../dto/broadcast.dto";
import { broadcastRuleErrors, canCancelBroadcast, canDeleteBroadcast, canEditBroadcast, parseScheduledAt } from "../notification-rules";
import { broadcastEmailBody, fieldsOf, toBroadcast, toBroadcastData } from "../notification.mapper";
import { DRAFT_COPY_SUFFIX, LIMITS } from "../notifications.constants";
import type { BroadcastFields, BroadcastListItem, BroadcastStatus } from "../notifications.types";
import { BroadcastSenderService, type SendReport } from "./broadcast-sender.service";
import { BroadcastsQueryService } from "./broadcasts-query.service";

type SaveResult = BroadcastListItem & { delivery: SendReport | null };

/** Write side of admin Broadcasts: send now / schedule / draft, edit, cancel, duplicate, delete, retry, test. */
@Injectable()
export class BroadcastAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly query: BroadcastsQueryService,
    private readonly sender: BroadcastSenderService,
    private readonly config: ConfigService,
  ) {}

  async create(actor: AuthUser, dto: SaveBroadcastDto): Promise<SaveResult> {
    const { asDraft = false, ...form } = dto;
    const fields = await this.validated(form, asDraft);
    const { status, sendAt } = this.lifecycle(fields, asDraft);
    const row = await this.prisma.announcement.create({
      data: { ...toBroadcastData(fields, sendAt), status, createdBy: actor.userId, institutionId: actor.institutionId ?? null },
    });
    const delivery = status === "SENT" ? await this.sender.deliver(row) : null;
    return { ...(await this.query.item(await this.prisma.announcement.findUniqueOrThrow({ where: { id: row.id } }))), delivery };
  }

  async update(actor: AuthUser, id: string, dto: SaveBroadcastDto): Promise<SaveResult> {
    const current = await this.query.mustFind(actor, id);
    const status0 = toBroadcast(current, "").status;
    if (!canEditBroadcast(status0))
      throw new BadRequestException(status0 === "SENT" ? "Sent broadcasts can't be edited. Duplicate it instead." : "Cancelled broadcasts can't be edited. Duplicate it instead.");
    const { asDraft = false, ...form } = dto;
    const fields = await this.validated(form, asDraft);
    const { status, sendAt } = this.lifecycle(fields, asDraft);
    // Atomic: the scheduler may be sending this very broadcast right now.
    const { count } = await this.prisma.announcement.updateMany({
      where: { id, status: { in: ["DRAFT", "SCHEDULED"] } },
      data: { ...toBroadcastData(fields, sendAt), status },
    });
    if (!count) throw new ConflictException("This broadcast was just sent or cancelled. Refresh and try again.");
    const row = await this.prisma.announcement.findUniqueOrThrow({ where: { id } });
    const delivery = status === "SENT" ? await this.sender.deliver(row) : null;
    return { ...(await this.query.item(await this.prisma.announcement.findUniqueOrThrow({ where: { id } }))), delivery };
  }

  async cancel(actor: AuthUser, id: string): Promise<BroadcastListItem> {
    const current = await this.query.mustFind(actor, id);
    if (!canCancelBroadcast(toBroadcast(current, "").status)) throw new BadRequestException("Only scheduled broadcasts can be cancelled.");
    const { count } = await this.prisma.announcement.updateMany({ where: { id, status: "SCHEDULED" }, data: { status: "CANCELLED" } });
    if (!count) throw new ConflictException("This broadcast was just sent. Refresh to see its delivery.");
    return this.query.item(await this.prisma.announcement.findUniqueOrThrow({ where: { id } }));
  }

  /** Copy as a DRAFT without a send time or deliveries. */
  async duplicate(actor: AuthUser, id: string): Promise<BroadcastListItem> {
    const source = toBroadcast(await this.query.mustFind(actor, id), "");
    const fields = fieldsOf(source);
    const row = await this.prisma.announcement.create({
      data: {
        ...toBroadcastData({ ...fields, title: `${source.title}${DRAFT_COPY_SUFFIX}`.slice(0, LIMITS.titleMax) }, null),
        status: "DRAFT",
        createdBy: actor.userId,
        institutionId: actor.institutionId ?? null,
      },
    });
    return this.query.item(row);
  }

  async remove(actor: AuthUser, id: string): Promise<{ id: string }> {
    const current = await this.query.mustFind(actor, id);
    if (!canDeleteBroadcast(toBroadcast(current, "").status)) throw new BadRequestException("Sent broadcasts are kept for reporting and can't be deleted.");
    const { count } = await this.prisma.announcement.deleteMany({ where: { id, status: { not: "SENT" } } });
    if (!count) throw new ConflictException("This broadcast was just sent and is kept for reporting.");
    return { id };
  }

  async retryFailed(actor: AuthUser, id: string): Promise<{ retried: number }> {
    const row = await this.query.mustFind(actor, id);
    if (toBroadcast(row, "").status !== "SENT") throw new BadRequestException("Only sent broadcasts have deliveries to retry.");
    return { retried: await this.sender.retryFailedEmails(row) };
  }

  /** "Send test": email the current broadcast content to the signed-in admin. */
  async sendTest(actor: AuthUser, dto: TestBroadcastDto): Promise<{ email: string }> {
    const me = await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { name: true, email: true } });
    const email = me?.email ?? actor.email;
    const appUrl = this.config.get<string>("STUDENT_APP_URL") || this.config.get<string>("FRONTEND_URL") || "";
    const body = broadcastEmailBody({ messageHtml: sanitizeRichText(dto.messageHtml), ctaLabel: dto.ctaLabel ?? "", ctaUrl: dto.ctaUrl ?? "" }, appUrl);
    try {
      await this.sender.sendTestEmail(email, me?.name ?? "there", "Test broadcast", `[Test] ${dto.title}`, body);
    } catch {
      throw new ServiceUnavailableException("We couldn't send the test email. Check the mail settings and try again.");
    }
    return { email };
  }

  // ---------------------------------------------------------------- helpers

  private async validated(form: Omit<SaveBroadcastDto, "asDraft">, asDraft: boolean): Promise<BroadcastFields> {
    const fields: BroadcastFields = {
      title: form.title,
      messageHtml: sanitizeRichText(form.messageHtml),
      audience: form.audience,
      courseIds: form.audience === "COURSE" ? [...new Set(form.courseIds ?? [])] : [],
      channels: [...new Set(form.channels)],
      priority: form.priority ?? "NORMAL",
      ctaLabel: form.ctaLabel ?? "",
      ctaUrl: form.ctaUrl ?? "",
      timing: form.timing ?? "NOW",
      scheduledAt: form.scheduledAt ?? "",
    };
    const errors = broadcastRuleErrors(fields, { asDraft });
    if (errors.length) throw new BadRequestException(errors);
    if (fields.courseIds.length) {
      const found = await this.prisma.course.count({ where: { id: { in: fields.courseIds } } });
      if (found !== fields.courseIds.length) throw new BadRequestException(["One of the selected courses no longer exists"]);
    }
    return fields;
  }

  private lifecycle(f: BroadcastFields, asDraft: boolean): { status: BroadcastStatus; sendAt: Date | null } {
    if (asDraft) return { status: "DRAFT", sendAt: f.timing === "SCHEDULE" ? parseScheduledAt(f.scheduledAt) : null };
    if (f.timing === "SCHEDULE") return { status: "SCHEDULED", sendAt: parseScheduledAt(f.scheduledAt) };
    return { status: "SENT", sendAt: new Date() };
  }
}
