// src/user/user.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import * as bcrypt from "bcrypt";

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("User not found");

    const { password, verificationToken, ...safeUser } = user;
    return safeUser;
  }

  async updateProfile(userId: string, data: any, avatarUrl?: string) {
    const updatePayload = { ...data };
    if (avatarUrl) {
      updatePayload.avatar = avatarUrl;
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: updatePayload,
    });

    const { password, verificationToken, ...safeUser } = updated;
    return safeUser;
  }

  async changePassword(userId: string, currentPass: string, newPass: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");

    const isMatch = await bcrypt.compare(currentPass, user.password);
    if (!isMatch) {
      throw new BadRequestException("Current password is incorrect");
    }

    const hashed = await bcrypt.hash(newPass, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashed },
    });

    return { message: "Password updated successfully" };
  }

  async changeUserRole(id: string, role: string) {
    return this.prisma.user.update({ where: { id }, data: { role } });
  }

  async findAll() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: "desc" },
    });
    return users.map((u) => {
      const { password, verificationToken, ...safeUser } = u;
      return safeUser;
    });
  }

  async toggleBlockStatus(id: string, status: string) {
    return await this.prisma.user.update({
      where: { id },
      data: { status },
    });
  }

  async deleteUser(id: string) {
    return await this.prisma.user.delete({
      where: { id },
    });
  }
}
