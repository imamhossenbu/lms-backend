// src/user/user.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async findOne(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async updateProfile(userId: string, data: any, avatarUrl?: string) {
  const updateData: any = { ...data };
  if (avatarUrl) updateData.avatar = avatarUrl;


  return await this.prisma.$transaction([
    this.prisma.user.update({ where: { id: userId }, data: { avatar: avatarUrl, name: data.name } }),
    this.prisma.userProfile.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    }),
  ]);
}

  async changeUserRole(id: string, role: string) {
    return this.prisma.user.update({ where: { id }, data: { role } });
  }
}