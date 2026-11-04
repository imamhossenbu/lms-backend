import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { Prisma } from "../../../generated/prisma";
import { MailService } from "../../auth/mail/mail.service";
import { encryptSecret } from "../../common/crypto";
import { PrismaService } from "../../prisma/prisma.service";
import type { ActorContext } from "../../team/services/team-access.service";
import { AUDIT_MAX } from "../workspace-settings.constants";
import { scopeKeyOf, storedSecrets, toStore } from "../workspace-settings.mapper";
import { auditSummary, changedKeys, extractSecrets, humanize, isSecretPath, mergeSection, settingsRuleErrors } from "../workspace-settings.rules";
import { INTEGRATION_KEYS, type IntegrationKey, type PlatformSettings, type SettingsAuditEntry, type SettingsSection, type SettingsStore } from "../workspace-settings.types";
import { WorkspaceSettingsReader } from "./workspace-settings-reader.service";
import { PlanAccessService } from "../../plan-access/plan-access.service";

type Tx = Prisma.TransactionClient;
const json = (v: unknown) => v as Prisma.InputJsonValue;

/** Admin panel › Settings: read the whole store, save one section, secrets and the small test actions. */
@Injectable()
export class WorkspaceSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reader: WorkspaceSettingsReader,
    private readonly mail: MailService,
    private readonly plans: PlanAccessService,
  ) {}

  async store(tenantId: string | null): Promise<SettingsStore> {
    const [row, defaults] = await Promise.all([this.prisma.workspaceSettings.findUnique({ where: { scopeKey: scopeKeyOf(tenantId) } }), this.reader.defaults(tenantId)]);
    return toStore(row, defaults);
  }

  /** Validates cross-field rules, encrypts secrets, logs the changed fields and returns the fresh store. */
  async save<K extends SettingsSection>(ctx: ActorContext, section: K, values: PlatformSettings[K]): Promise<SettingsStore> {
    const errors = settingsRuleErrors(section, values);
    if (section === "security" && (values as PlatformSettings["security"]).requireAdmin2fa && !ctx.twoFactorEnabled && !ctx.member.isOwner)
      errors.push("Turn on two-factor authentication for your own account before requiring it for admins");
    if (errors.length) throw new BadRequestException(errors);
    if (section === "branding" && (values as PlatformSettings["branding"]).showPoweredBy === false) await this.plans.assertFeature(ctx.tenantId, "whiteLabel");

    const defaults = await this.reader.defaults(ctx.tenantId);
    const row = await this.locked(ctx.tenantId, async (tx, cur) => {
      const before = mergeSection(section, cur[section], defaults) as unknown as Record<string, unknown>;
      const { clean, secrets, changed } = extractSecrets(section, values, storedSecrets(cur), encryptSecret);
      const labels = [...changedKeys(before, clean as unknown as Record<string, unknown>), ...changed].map(humanize);
      const now = new Date().toISOString();
      return tx.workspaceSettings.update({
        where: { id: cur.id },
        data: {
          [section]: json(clean),
          secrets: json(secrets),
          sectionUpdatedAt: json({ ...(cur.sectionUpdatedAt as object), [section]: now }),
          audit: json(this.withAudit(cur.audit, section, auditSummary([...new Set(labels)]), ctx, now)),
        },
      });
    });
    return toStore(row, defaults);
  }

  /** Removes one stored secret (e.g. "integrations.zoom.apiKey" on Disconnect). */
  async clearSecret(ctx: ActorContext, path: string): Promise<SettingsStore> {
    if (!isSecretPath(path)) throw new BadRequestException("Unknown secret");
    const section = path.split(".")[0] as SettingsSection;
    const row = await this.locked(ctx.tenantId, (tx, cur) => {
      const secrets = { ...storedSecrets(cur) };
      if (!secrets[path]) return Promise.resolve(cur);
      delete secrets[path];
      const label = humanize(path.split(".").slice(1).join("."));
      return tx.workspaceSettings.update({
        where: { id: cur.id },
        data: { secrets: json(secrets), audit: json(this.withAudit(cur.audit, section, `Removed ${label}`, ctx, new Date().toISOString())) },
      });
    });
    return toStore(row, await this.reader.defaults(ctx.tenantId));
  }

  /** Settings › Integrations › Test. Checks the saved state (no outbound calls to the providers yet). */
  async testIntegration(ctx: ActorContext, key: string): Promise<{ ok: boolean; latencyMs: number }> {
    if (!(INTEGRATION_KEYS as readonly string[]).includes(key)) throw new NotFoundException("This integration doesn't exist.");
    const started = Date.now();
    const [integrations, secrets] = await Promise.all([
      this.reader.section(ctx.tenantId, "integrations"),
      this.prisma.workspaceSettings.findUnique({ where: { scopeKey: scopeKeyOf(ctx.tenantId) }, select: { secrets: true } }),
    ]);
    const i = integrations[key as IntegrationKey];
    const ok = i.connected && (!!i.accountLabel || !!storedSecrets(secrets)[`integrations.${key}.apiKey`]);
    return { ok, latencyMs: Date.now() - started };
  }

  /** Settings › Email › Send test email (sent through the platform mailer). */
  async sendTestEmail(ctx: ActorContext, to: string): Promise<{ to: string }> {
    const general = await this.reader.section(ctx.tenantId, "general");
    try {
      await this.mail.sendAdminMessageEmail(
        to,
        to,
        ctx.name,
        `Test email from ${general.platformName}`,
        `This is a test email from ${general.platformName}. If you're reading this, email delivery works.`,
      );
    } catch {
      throw new BadGatewayException("We couldn't send the test email. Check your email settings and try again.");
    }
    return { to };
  }

  // ---------------------------------------------------------------- helpers

  /** Runs `fn` with this workspace's row created (if needed) and locked, so concurrent saves don't lose secrets or audit entries. */
  private async locked<T>(tenantId: string | null, fn: (tx: Tx, cur: Prisma.WorkspaceSettingsGetPayload<object>) => Promise<T>): Promise<T> {
    const scopeKey = scopeKeyOf(tenantId);
    return this.prisma.$transaction(async (tx) => {
      await tx.workspaceSettings.createMany({ data: [{ scopeKey, institutionId: tenantId }], skipDuplicates: true });
      await tx.$executeRaw`SELECT 1 FROM "workspace_settings" WHERE "scopeKey" = ${scopeKey} FOR UPDATE`;
      return fn(tx, await tx.workspaceSettings.findUniqueOrThrow({ where: { scopeKey } }));
    });
  }

  private withAudit(audit: unknown, section: SettingsSection, summary: string | null, ctx: ActorContext, at: string): SettingsAuditEntry[] {
    const list = (Array.isArray(audit) ? audit : []) as SettingsAuditEntry[];
    if (!summary) return list;
    return [{ id: randomUUID(), section, summary, actor: ctx.name, at }, ...list].slice(0, AUDIT_MAX);
  }
}
