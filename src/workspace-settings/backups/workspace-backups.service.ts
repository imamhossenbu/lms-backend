import { HttpException, HttpStatus, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { gzipSync } from "zlib";
import { PrismaService } from "../../prisma/prisma.service";
import { mergeSection } from "../workspace-settings.rules";
import { scopeKeyOf } from "../workspace-settings.mapper";
import { collectWorkspace } from "./backup-collector";

export interface BackupItem {
  id: string;
  kind: "AUTO" | "MANUAL";
  sizeBytes: number;
  /** Total rows across all tables. */
  rows: number;
  tables: number;
  createdByName: string;
  createdAt: string;
  expiresAt: string;
}

const DAY_MS = 86_400_000;
/** "Back up now" at most this often per workspace. */
const MANUAL_COOLDOWN_MS = 2 * 60_000;

const toItem = (b: { id: string; kind: string; sizeBytes: number; tableCounts: unknown; createdByName: string; createdAt: Date; expiresAt: Date }): BackupItem => {
  const counts = (b.tableCounts ?? {}) as Record<string, number>;
  return {
    id: b.id,
    kind: b.kind === "AUTO" ? "AUTO" : "MANUAL",
    sizeBytes: b.sizeBytes,
    rows: Object.values(counts).reduce((s, n) => s + (Number(n) || 0), 0),
    tables: Object.keys(counts).length,
    createdByName: b.createdByName,
    createdAt: b.createdAt.toISOString(),
    expiresAt: b.expiresAt.toISOString(),
  };
};

/**
 * Settings › Maintenance › Backups: gzipped JSON snapshots of a workspace (see backup-collector.ts), made nightly
 * at 02:00 platform time when "Automatic backups" is on (daily or weekly) or on demand, kept for the retention days.
 */
@Injectable()
export class WorkspaceBackupsService {
  private readonly logger = new Logger(WorkspaceBackupsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async maintenance(tenantId: string | null) {
    const row = await this.prisma.workspaceSettings.findUnique({ where: { scopeKey: scopeKeyOf(tenantId) }, select: { maintenance: true } });
    return mergeSection("maintenance", row?.maintenance ?? null);
  }

  async list(tenantId: string | null): Promise<BackupItem[]> {
    const rows = await this.prisma.workspaceBackup.findMany({ where: { institutionId: tenantId }, orderBy: { createdAt: "desc" }, take: 100 });
    return rows.map(toItem);
  }

  /** Builds and stores a backup now. */
  async create(tenantId: string | null, kind: "AUTO" | "MANUAL", createdByName = ""): Promise<BackupItem> {
    if (kind === "MANUAL") {
      const recent = await this.prisma.workspaceBackup.findFirst({ where: { institutionId: tenantId, kind: "MANUAL", createdAt: { gt: new Date(Date.now() - MANUAL_COOLDOWN_MS) } }, select: { id: true } });
      if (recent) throw new HttpException("A backup was made a moment ago. Please wait a couple of minutes before making another one.", HttpStatus.TOO_MANY_REQUESTS);
    }
    const [collected, maintenance, workspace] = await Promise.all([
      collectWorkspace(this.prisma, tenantId),
      this.maintenance(tenantId),
      tenantId ? this.prisma.institution.findUnique({ where: { id: tenantId }, select: { id: true, name: true, slug: true } }) : Promise.resolve(null),
    ]);
    const now = new Date();
    const file = {
      format: "edupro-workspace-backup",
      version: 1,
      createdAt: now.toISOString(),
      workspace: workspace ?? { id: null, name: "Legacy workspace", slug: "legacy" },
      note: "Passwords, secrets, tokens and hashes are not included.",
      removedFields: collected.removedFields,
      counts: collected.counts,
      tables: collected.tables,
    };
    const json = JSON.stringify(file, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    const data = gzipSync(Buffer.from(json, "utf8"));
    const saved = await this.prisma.workspaceBackup.create({
      data: {
        institutionId: tenantId,
        kind,
        data,
        sizeBytes: data.length,
        tableCounts: collected.counts,
        createdByName,
        expiresAt: new Date(now.getTime() + maintenance.backupRetentionDays * DAY_MS),
      },
    });
    return toItem(saved);
  }

  /** The gzipped JSON file and a download name. */
  async download(tenantId: string | null, id: string): Promise<{ filename: string; data: Buffer }> {
    const row = await this.prisma.workspaceBackup.findFirst({ where: { id, institutionId: tenantId }, omit: { data: false } });
    if (!row) throw new NotFoundException("Backup not found");
    const slug = tenantId ? ((await this.prisma.institution.findUnique({ where: { id: tenantId }, select: { slug: true } }))?.slug ?? "workspace") : "legacy";
    const stamp = row.createdAt.toISOString().slice(0, 16).replace(/[:T]/g, "-");
    return { filename: `edupro-backup-${slug}-${stamp}.json.gz`, data: Buffer.from(row.data) };
  }

  async remove(tenantId: string | null, id: string): Promise<void> {
    const res = await this.prisma.workspaceBackup.deleteMany({ where: { id, institutionId: tenantId } });
    if (!res.count) throw new NotFoundException("Backup not found");
  }

  /** Nightly at 02:00 Asia/Dhaka (20:00 UTC): automatic backups that are due, then retention clean-up. */
  @Cron("0 0 20 * * *", { name: "workspace-backups" })
  async nightly(): Promise<void> {
    const workspaces = await this.prisma.institution.findMany({ where: { status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } }, select: { id: true } });
    let made = 0;
    for (const w of workspaces) {
      try {
        if (await this.isDue(w.id)) {
          await this.create(w.id, "AUTO", "Automatic backup");
          made++;
        }
      } catch (err) {
        this.logger.warn(`Backup failed for workspace ${w.id}: ${(err as Error).message}`);
      }
    }
    const purged = await this.purgeExpired();
    this.logger.log(`Nightly backups: ${made} made, ${purged} expired removed`);
  }

  /** Automatic backups on, and none (daily) / none in the last ~week (weekly) yet. */
  async isDue(tenantId: string | null, now = new Date()): Promise<boolean> {
    const m = await this.maintenance(tenantId);
    if (!m.autoBackup) return false;
    const windowMs = m.backupFrequency === "WEEKLY" ? 6.5 * DAY_MS : 20 * 3_600_000;
    const recent = await this.prisma.workspaceBackup.findFirst({ where: { institutionId: tenantId, kind: "AUTO", createdAt: { gt: new Date(now.getTime() - windowMs) } }, select: { id: true } });
    return !recent;
  }

  async purgeExpired(now = new Date()): Promise<number> {
    return (await this.prisma.workspaceBackup.deleteMany({ where: { expiresAt: { lt: now } } })).count;
  }
}
