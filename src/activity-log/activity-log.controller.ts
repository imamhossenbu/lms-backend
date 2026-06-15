// activity-log.controller.ts
import { Controller, Get, UseGuards, Query } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";

@Controller("admin/activity-logs")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles("ADMIN")
export class ActivityLogController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async getLogs(
    @Query("page") page: number = 1,
    @Query("limit") limit: number = 50,
  ) {
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        orderBy: { createdAt: "desc" },
        skip: skip,
        take: Number(limit),
      }),
      this.prisma.activityLog.count(),
    ]);

    return {
      data: logs,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
