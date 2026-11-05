import { Injectable, Logger } from "@nestjs/common";
import { MailService } from "../../auth/mail/mail.service";
import { PrismaService } from "../../prisma/prisma.service";
import type { ContactRequestDto } from "./contact.dto";

const TOPIC_LABEL: Record<string, string> = { DEMO: "Book a demo", SALES: "Pricing & plans", SUPPORT: "Support", PARTNERSHIP: "Partnership", OTHER: "Something else" };

/** Contact / demo requests from the marketing website: stored as leads, and every platform owner is emailed. */
@Injectable()
export class MarketingLeadsService {
  private readonly logger = new Logger(MarketingLeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async create(dto: ContactRequestDto, ip = ""): Promise<{ received: true }> {
    // Bots fill the hidden field: answer the same way, store nothing.
    if (dto.website?.trim()) return { received: true };
    const lead = await this.prisma.marketingLead.create({
      data: {
        name: dto.name,
        email: dto.email.toLowerCase(),
        phone: dto.phone ?? "",
        institutionName: dto.institutionName ?? "",
        studentCount: dto.studentCount ?? "",
        topic: dto.topic,
        message: dto.message,
        ip: ip.replace(/^::ffff:/, "").slice(0, 64),
      },
    });
    const owners = await this.prisma.user.findMany({ where: { role: "SUPER_ADMIN", status: "ACTIVE", deletedAt: null }, select: { email: true, name: true } });
    const body = [
      `${TOPIC_LABEL[lead.topic] ?? lead.topic} — from the EduPro website.`,
      "",
      `Name: ${lead.name}`,
      `Email: ${lead.email}`,
      lead.phone && `Phone: ${lead.phone}`,
      lead.institutionName && `Institution: ${lead.institutionName}`,
      lead.studentCount && `Students: ${lead.studentCount}`,
      "",
      lead.message,
    ]
      .filter((l) => l !== "")
      .join("\n");
    for (const o of owners) {
      try {
        await this.mail.sendAdminMessageEmail(o.email, o.name, lead.name, `New website enquiry: ${TOPIC_LABEL[lead.topic] ?? lead.topic}`, body);
      } catch (err) {
        this.logger.warn(`Couldn't email ${o.email} about lead ${lead.id}: ${(err as Error).message}`);
      }
    }
    return { received: true };
  }
}
