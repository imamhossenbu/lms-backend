import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import type { Prisma, User } from "../../../generated/prisma";
import { MailService } from "../../auth/mail/mail.service";
import { assertEmailFree, BCRYPT_ROUNDS, generatePassword } from "../../common/accounts";
import { type AuthUser, tenantWhere } from "../../common/auth-user";
import { paginated, skipTake, type Paginated } from "../../common/pagination";
import { PrismaService } from "../../prisma/prisma.service";
import type { CreateStudentDto, StudentQueryDto, UpdateStudentDto } from "../dto/student.dto";
import { STATUS_FROM_LABEL, STATUS_LABEL, STATUSES_FOR_LABEL, STUDENT_ROLE, studentIdCode } from "../students.constants";
import type { StudentDetails, StudentListItem, StudentStatusLabel } from "../students.types";
import { StudentEnrollmentsService } from "./student-enrollments.service";
import { StudentProgressService, type StudentSummary } from "./student-progress.service";
import { PlanAccessService } from "../../plan-access/plan-access.service";
import { SecurityPolicyService } from "../../workspace-settings/security-policy.service";

/** Admin panel › Students: list, details, create (with auto password + welcome email), edit, status, soft delete. */
@Injectable()
export class StudentsService {
  private readonly logger = new Logger(StudentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly progress: StudentProgressService,
    private readonly enrollments: StudentEnrollmentsService,
    private readonly mail: MailService,
    private readonly plans: PlanAccessService,
    private readonly securityPolicy: SecurityPolicyService,
  ) {}

  /** Students visible to this admin: same tenant, not deleted. */
  private scope(actor: AuthUser): Prisma.UserWhereInput {
    return { role: STUDENT_ROLE, deletedAt: null, ...tenantWhere(actor) };
  }

  async mustFind(actor: AuthUser, id: string): Promise<User> {
    const student = await this.prisma.user.findFirst({ where: { id, ...this.scope(actor) } });
    if (!student) throw new NotFoundException("Student not found.");
    return student;
  }

  private toListItem(u: User, s: StudentSummary): StudentListItem {
    return {
      id: u.id,
      studentIdCode: studentIdCode(u.id),
      name: u.name,
      email: u.email,
      phone: u.phone ?? "",
      avatarUrl: u.avatar,
      status: STATUS_LABEL[u.status] ?? "Inactive",
      emailVerified: u.emailVerified,
      joinDate: u.createdAt.toISOString(),
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      ...s,
    };
  }

  // ---------------------------------------------------------------- reads

  async list(actor: AuthUser, query: StudentQueryDto): Promise<Paginated<StudentListItem>> {
    const where: Prisma.UserWhereInput = {
      ...this.scope(actor),
      ...(query.status ? { status: { in: STATUSES_FOR_LABEL[query.status] } } : {}),
      ...(query.courseId ? { enrollments: { some: { courseId: query.courseId } } } : {}),
      ...(query.joinedWithinDays ? { createdAt: { gte: new Date(Date.now() - query.joinedWithinDays * 86_400_000) } } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: "insensitive" } },
              { email: { contains: query.q, mode: "insensitive" } },
              { phone: { contains: query.q } },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.UserOrderByWithRelationInput = query.sortBy === "name" ? { name: query.sortOrder } : { createdAt: query.sortOrder };

    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({ where, orderBy: [orderBy, { id: "asc" }], ...skipTake(query) }),
    ]);
    const summaries = await this.progress.summaries(rows.map((r) => r.id));
    return paginated(
      rows.map((r) => this.toListItem(r, summaries.get(r.id)!)),
      total,
      query,
    );
  }

  async detail(actor: AuthUser, id: string): Promise<StudentDetails> {
    const student = await this.mustFind(actor, id);
    const [summaries, metrics] = await Promise.all([this.progress.summaries([id]), this.progress.metrics(id)]);
    return { ...this.toListItem(student, summaries.get(id)!), ...metrics };
  }

  // ---------------------------------------------------------------- writes

  /**
   * Creates the student with a generated password, enrolls the selected courses (one transaction),
   * then emails the login details. Admin-created accounts are treated as email-verified.
   */
  async create(actor: AuthUser, dto: CreateStudentDto): Promise<StudentDetails> {
    await this.plans.assertCanAdd(actor.institutionId ?? null, "students");
    await assertEmailFree(this.prisma, dto.email);
    // Long enough for the workspace's password policy (it always mixes all character types).
    const password = generatePassword(await this.securityPolicy.generatedPasswordLength(actor.institutionId ?? null));
    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const student = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          phone: dto.phone || null,
          password: hashed,
          role: STUDENT_ROLE,
          status: STATUS_FROM_LABEL[dto.status],
          emailVerified: true,
          institutionId: actor.institutionId ?? null,
        },
      });
      if (dto.enrolledCourseIds.length) await this.enrollments.enrollInTx(tx, created.id, dto.enrolledCourseIds);
      return created;
    });

    try {
      await this.mail.sendAccountWelcomeEmail(student.email, student.name, password, "student");
    } catch (err: any) {
      // The account exists either way; the admin can trigger a password reset if the email didn't arrive.
      this.logger.warn(`Welcome email to ${student.email} failed: ${err?.message ?? err}`);
    }
    return this.detail(actor, student.id);
  }

  async update(actor: AuthUser, id: string, dto: UpdateStudentDto): Promise<StudentDetails> {
    await this.mustFind(actor, id);
    if (dto.email) await assertEmailFree(this.prisma, dto.email, id);
    await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone || null } : {}),
        ...(dto.status !== undefined ? { status: STATUS_FROM_LABEL[dto.status] } : {}),
      },
    });
    return this.detail(actor, id);
  }

  async setStatus(actor: AuthUser, id: string, status: StudentStatusLabel): Promise<StudentDetails> {
    return this.update(actor, id, { status });
  }

  /** Soft delete: hidden from lists and blocked from logging in; learning records are kept. */
  async remove(actor: AuthUser, id: string): Promise<{ id: string; deleted: true }> {
    await this.mustFind(actor, id);
    await this.prisma.user.update({ where: { id }, data: { deletedAt: new Date(), status: "BLOCKED" } });
    return { id, deleted: true };
  }
}
