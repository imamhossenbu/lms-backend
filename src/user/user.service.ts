// src/user/user.service.ts
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async findOne(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async updateProfile(userId: string, data: any, avatarUrl?: string) {
    const updatePayload = { ...data };
    if (avatarUrl) {
      updatePayload.avatar = avatarUrl;
    }

    return await this.prisma.user.update({
      where: { id: userId },
      data: updatePayload,
    });
  }

  async changeUserRole(id: string, role: string) {
    return this.prisma.user.update({ where: { id }, data: { role } });
  }

  async findAll() {
    return await this.prisma.user.findMany();
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
