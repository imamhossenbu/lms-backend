// activity-log.controller.ts
import { Controller, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Prisma } from "../../generated/prisma";
import { CurrentUser, RequireRoles, ValidateDto, type AuthUser } from "../common/auth-user";
import { paginated, PaginationQueryDto } from "../common/pagination";
import { tenantOf } from "../common/tenancy";
import { PrismaService } from "../prisma/prisma.service";
import { RequirePermission } from "../team/permissions.guard";

interface LogRow {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
  userName: string | null;
  userEmail: string | null;
}

/** Request audit log — only actions by users of the admin's own workspace. */
@ApiTags("Activity log")
@Controller("admin/activity-logs")
@RequireRoles("ADMIN")
@ValidateDto()
export class ActivityLogController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @RequirePermission("team", "view")
  @ApiOperation({ summary: "Paginated activity of this workspace's users, newest first" })
  async getLogs(@CurrentUser() user: AuthUser, @Query() q: PaginationQueryDto) {
    const tenantId = tenantOf(user);
    // ActivityLog has no FK to User (logs outlive hard-deleted users), so scope with a join.
    const tenantFilter = tenantId === null ? Prisma.sql`u."institutionId" IS NULL` : Prisma.sql`u."institutionId" = ${tenantId}`;
    const [rows, count] = await Promise.all([
      this.prisma.$queryRaw<LogRow[]>(Prisma.sql`
        SELECT l.*, u.name AS "userName", u.email AS "userEmail"
        FROM "ActivityLog" l JOIN "User" u ON u.id = l."userId"
        WHERE ${tenantFilter}
        ORDER BY l."createdAt" DESC
        LIMIT ${q.limit} OFFSET ${(q.page - 1) * q.limit}`),
      this.prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
        SELECT COUNT(*)::int AS n FROM "ActivityLog" l JOIN "User" u ON u.id = l."userId" WHERE ${tenantFilter}`),
    ]);
    const data = rows.map(({ userName, userEmail, ...log }) => ({ ...log, user: { name: userName, email: userEmail } }));
    return paginated(data, count[0]?.n ?? 0, q);
  }
}
