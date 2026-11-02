import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import type { Prisma, User } from "../../../generated/prisma";
import { MailService } from "../../auth/mail/mail.service";
import { assertEmailFree, BCRYPT_ROUNDS, generatePassword } from "../../common/accounts";
import { type AuthUser, tenantWhere } from "../../common/auth-user";
import { paginated, skipTake, type Paginated } from "../../common/pagination";
import { PrismaService } from "../../prisma/prisma.service";
import type { CreateInstructorDto, InstructorMessageDto, InstructorQueryDto, UpdateInstructorDto } from "../dto/instructor.dto";
import { INSTRUCTOR_ROLE, instructorStatusLabel, parseSkills, parseSocials, STATUS_FROM_LABEL, STATUSES_FOR_LABEL } from "../instructors.constants";
import type { InstructorDetails, InstructorListItem, InstructorStatusLabel } from "../instructors.types";
import { InstructorStatsService, type InstructorSummary } from "./instructor-stats.service";

type Tx = Prisma.TransactionClient;

/** Admin panel › Instructors: list, details, create (auto password + welcome email), edit, status, delete, courses, messages. */
@Injectable()
export class InstructorsService {
  private readonly logger = new Logger(InstructorsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stats: InstructorStatsService,
    private readonly mail: MailService,
  ) {}

  /** Instructors visible to this admin: same tenant, not deleted. */
  private scope(actor: AuthUser): Prisma.UserWhereInput {
    return { role: INSTRUCTOR_ROLE, deletedAt: null, ...tenantWhere(actor) };
  }

  async mustFind(actor: AuthUser, id: string): Promise<User> {
    const instructor = await this.prisma.user.findFirst({ where: { id, ...this.scope(actor) } });
    if (!instructor) throw new NotFoundException("Instructor not found.");
    return instructor;
  }

  private toListItem(u: User, s: InstructorSummary): InstructorListItem {
    const { teachingMinutes: _unused, ...summary } = s;
    return {
      id: u.id,
      name: u.name,
      title: u.headline ?? "",
      expertise: u.expertise ?? "",
      email: u.email,
      phone: u.phone ?? "",
      avatarUrl: u.avatar,
      status: instructorStatusLabel(u.status),
      emailVerified: u.emailVerified,
      joinDate: u.createdAt.toISOString(),
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      ...summary,
    };
  }

  // ---------------------------------------------------------------- reads

  async list(actor: AuthUser, query: InstructorQueryDto): Promise<Paginated<InstructorListItem>> {
    const where: Prisma.UserWhereInput = {
      ...this.scope(actor),
      ...(query.status ? { status: { in: STATUSES_FOR_LABEL[query.status] } } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: "insensitive" } },
              { email: { contains: query.q, mode: "insensitive" } },
              { headline: { contains: query.q, mode: "insensitive" } },
              { expertise: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.UserOrderByWithRelationInput = query.sortBy === "name" ? { name: query.sortOrder } : { createdAt: query.sortOrder };
    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({ where, orderBy: [orderBy, { id: "asc" }], ...skipTake(query) }),
    ]);
    const summaries = await this.stats.summaries(rows.map((r) => r.id));
    return paginated(
      rows.map((r) => this.toListItem(r, summaries.get(r.id)!)),
      total,
      query,
    );
  }

  async detail(actor: AuthUser, id: string): Promise<InstructorDetails> {
    const u = await this.mustFind(actor, id);
    const summary = (await this.stats.summaries([id])).get(id)!;
    const socials = parseSocials(u.socialLinks);
    return {
      ...this.toListItem(u, summary),
      bio: u.bio ?? "",
      skills: parseSkills(u.skills),
      website: socials.website,
      socials,
      teachingMinutes: summary.teachingMinutes,
      account: { twoFactorEnabled: false, createdAt: u.createdAt.toISOString(), lastLogin: u.lastLoginAt?.toISOString() ?? null },
    };
  }

  // ---------------------------------------------------------------- writes

  /** Moves the given courses to this instructor. */
  private async assignInTx(tx: Tx, instructorId: string, courseIds: string[]) {
    if (courseIds.length === 0) return 0;
    const found = await tx.course.count({ where: { id: { in: courseIds } } });
    if (found !== courseIds.length) throw new BadRequestException("One or more selected courses no longer exist.");
    const res = await tx.course.updateMany({ where: { id: { in: courseIds } }, data: { instructorId } });
    return res.count;
  }

  async create(actor: AuthUser, dto: CreateInstructorDto): Promise<InstructorDetails> {
    await assertEmailFree(this.prisma, dto.email);
    const password = generatePassword();
    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const instructor = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          phone: dto.phone || null,
          password: hashed,
          role: INSTRUCTOR_ROLE,
          status: STATUS_FROM_LABEL[dto.status],
          emailVerified: true,
          institutionId: actor.institutionId ?? null,
        },
      });
      await this.assignInTx(tx, created.id, dto.courseIds);
      return created;
    });

    try {
      await this.mail.sendAccountWelcomeEmail(instructor.email, instructor.name, password, "instructor");
    } catch (err: any) {
      this.logger.warn(`Welcome email to ${instructor.email} failed: ${err?.message ?? err}`);
    }
    return this.detail(actor, instructor.id);
  }

  async update(actor: AuthUser, id: string, dto: UpdateInstructorDto): Promise<InstructorDetails> {
    const current = await this.mustFind(actor, id);
    if (dto.email) await assertEmailFree(this.prisma, dto.email, id);
    // Merge only the known keys (validated by IsSocialLinks), trimming each value.
    const socials = dto.socials
      ? {
          ...parseSocials(current.socialLinks),
          ...Object.fromEntries(Object.entries(dto.socials).map(([k, v]) => [k, (v ?? "").trim()])),
        }
      : undefined;
    await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone || null } : {}),
        ...(dto.status !== undefined ? { status: STATUS_FROM_LABEL[dto.status] } : {}),
        ...(dto.title !== undefined ? { headline: dto.title || null } : {}),
        ...(dto.expertise !== undefined ? { expertise: dto.expertise || null } : {}),
        ...(dto.bio !== undefined ? { bio: dto.bio || null } : {}),
        ...(dto.skills !== undefined ? { skills: JSON.stringify(dto.skills.map((s) => s.trim()).filter(Boolean)) } : {}),
        ...(socials ? { socialLinks: JSON.stringify(socials) } : {}),
      },
    });
    return this.detail(actor, id);
  }

  setStatus(actor: AuthUser, id: string, status: InstructorStatusLabel) {
    return this.update(actor, id, { status });
  }

  async assignCourses(actor: AuthUser, id: string, courseIds: string[]) {
    await this.mustFind(actor, id);
    const assigned = await this.prisma.$transaction((tx) => this.assignInTx(tx, id, courseIds));
    return { assigned };
  }

  /**
   * Soft delete. Refused while the instructor still owns courses — every course needs an instructor,
   * so the admin must reassign them first.
   */
  async remove(actor: AuthUser, id: string): Promise<{ id: string; deleted: true }> {
    await this.mustFind(actor, id);
    const owned = await this.prisma.course.count({ where: { instructorId: id } });
    if (owned > 0) throw new ConflictException(`Reassign this instructor's ${owned} course${owned === 1 ? "" : "s"} before deleting them.`);
    await this.prisma.user.update({ where: { id }, data: { deletedAt: new Date(), status: "BLOCKED" } });
    return { id, deleted: true };
  }

  /** Emails a message from the signed-in admin to the instructor. */
  async sendMessage(actor: AuthUser, id: string, dto: InstructorMessageDto) {
    const instructor = await this.mustFind(actor, id);
    const sender = await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { name: true } });
    try {
      await this.mail.sendAdminMessageEmail(instructor.email, instructor.name, sender?.name ?? "Admin", dto.subject, dto.body);
    } catch (err: any) {
      this.logger.error(`Message to ${instructor.email} failed: ${err?.message ?? err}`);
      throw new ServiceUnavailableException("We couldn't send the email right now. Please try again in a few minutes.");
    }
    return { sent: true, to: instructor.email };
  }
}
