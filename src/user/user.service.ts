// src/user/user.service.ts
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import type { User } from "../../generated/prisma";
import { BCRYPT_ROUNDS } from "../common/accounts";
import { PrismaService } from "../prisma/prisma.service";
import type { UpdateProfileDto } from "./dto/user.dto";
import { PlanAccessService } from "../plan-access/plan-access.service";

/** Learners and instructors — the only roles the legacy /user admin endpoints may touch. */
const MANAGED_ROLES = ["STUDENT", "TEACHER"];

/** Never return secrets. */
function safe(user: User) {
  const { password, verificationToken, twoFactorSecret, ...rest } = user;
  return rest;
}

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    private plans: PlanAccessService,
  ) {}

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.deletedAt) throw new NotFoundException("User not found");
    return safe(user);
  }

  /** Only whitelisted profile fields (UpdateProfileDto) — role / status / email / tenant can't be changed here. */
  async updateProfile(userId: string, dto: UpdateProfileDto, avatarUrl?: string) {
    const data: Partial<UpdateProfileDto> & { avatar?: string } = {};
    for (const key of ["name", "phone", "bio", "education", "skills", "interests", "country", "language", "socialLinks", "address"] as const) {
      if (dto[key] !== undefined) data[key] = dto[key];
    }
    if (avatarUrl) data.avatar = avatarUrl;
    return safe(await this.prisma.user.update({ where: { id: userId }, data }));
  }

  async changePassword(userId: string, currentPass: string, newPass: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");
    if (!(await bcrypt.compare(currentPass, user.password))) throw new BadRequestException("Current password is incorrect");
    await this.prisma.user.update({ where: { id: userId }, data: { password: await bcrypt.hash(newPass, BCRYPT_ROUNDS) } });
    return { message: "Password updated successfully" };
  }

  // ---------------------------------------------------------------- admin (same workspace, learners / instructors only)

  /** A student / instructor of the admin's workspace, or 404. Admins can't act on themselves here. */
  private async mustManaged(actor: { userId: string; institutionId?: string | null }, id: string) {
    if (id === actor.userId) throw new ForbiddenException("You can't change your own account here.");
    const user = await this.prisma.user.findFirst({ where: { id, institutionId: actor.institutionId ?? null, deletedAt: null } });
    if (!user) throw new NotFoundException("User not found");
    if (!MANAGED_ROLES.includes(user.role)) throw new ForbiddenException("Admins are managed from Team & Roles.");
    return user;
  }

  async changeUserRole(actor: { userId: string; institutionId?: string | null }, id: string, role: "STUDENT" | "TEACHER") {
    const user = await this.mustManaged(actor, id);
    if (role === "TEACHER" && user.role !== "TEACHER") await this.plans.assertCanAdd(actor.institutionId ?? null, "teamMembers");
    return safe(await this.prisma.user.update({ where: { id }, data: { role } }));
  }

  /** Learners and instructors of the admin's workspace. */
  async findAll(actor: { institutionId?: string | null }) {
    const users = await this.prisma.user.findMany({
      where: { institutionId: actor.institutionId ?? null, deletedAt: null, role: { in: MANAGED_ROLES } },
      orderBy: { createdAt: "desc" },
    });
    return users.map(safe);
  }

  async toggleBlockStatus(actor: { userId: string; institutionId?: string | null }, id: string, status: string) {
    await this.mustManaged(actor, id);
    return safe(await this.prisma.user.update({ where: { id }, data: { status } }));
  }

  /** Soft delete (records kept, login blocked) — same behaviour as the Students / Instructors pages. */
  async deleteUser(actor: { userId: string; institutionId?: string | null }, id: string) {
    await this.mustManaged(actor, id);
    await this.prisma.user.update({ where: { id }, data: { deletedAt: new Date(), status: "BLOCKED" } });
    return { id, deleted: true };
  }
}
