// activity-log.service.ts
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Request } from "express";

@Injectable()
export class ActivityLogService {
  constructor(private prisma: PrismaService) {}

  async logAction(
    userId: string,
    action: string,
    entityType: string,
    entityId: string,
    req: Request,
  ) {
    try {
      await this.prisma.activityLog.create({
        data: {
          userId,
          action,
          entityType,
          entityId,

          ipAddress: req.ip || "0.0.0.0",
          userAgent: req.headers["user-agent"] || "unknown",
        },
      });
    } catch (error) {
      console.error("Failed to save activity log:", error);
    }
  }
}
