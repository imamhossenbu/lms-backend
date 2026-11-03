import { Injectable } from "@nestjs/common";
import type { CertificateEventKind, Prisma } from "../../../generated/prisma";
import { PrismaService } from "../../prisma/prisma.service";

type Db = PrismaService | Prisma.TransactionClient;

/** Writes a certificate's Activity card. Shared by the admin side, auto-issue, the learner and the public verify page. */
@Injectable()
export class CertificateEventsService {
  constructor(private readonly prisma: PrismaService) {}

  log(certificateId: string, kind: CertificateEventKind, message: string, actorName: string, actorId: string | null = null, db: Db = this.prisma) {
    return db.certificateEvent.create({ data: { certificateId, kind, message, actorName, actorId } });
  }
}
