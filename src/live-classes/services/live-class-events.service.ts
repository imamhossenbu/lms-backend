import { Injectable } from "@nestjs/common";
import type { LiveClassEventKind, Prisma } from "../../../generated/prisma";
import { PrismaService } from "../../prisma/prisma.service";

type Db = PrismaService | Prisma.TransactionClient;

/** Writes the Activity tab. Shared by the admin side and the student side (questions, joins). */
@Injectable()
export class LiveClassEventsService {
  constructor(private readonly prisma: PrismaService) {}

  log(liveClassId: string, kind: LiveClassEventKind, title: string, detail: string, actorName: string, refId?: string, db: Db = this.prisma) {
    return db.liveClassEvent.create({ data: { liveClassId, kind, title, detail, actorName, refId } });
  }
}
