import { BadRequestException, Global, Injectable, Module } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PrismaModule } from "../prisma/prisma.module";
import { mergeSection } from "./workspace-settings.rules";
import { scopeKeyOf } from "./workspace-settings.mapper";
import type { SecuritySettings } from "./workspace-settings.types";
import { isIdleExpired, passwordPolicyErrors } from "./security-policy";

const CACHE_MS = 30_000;
/** lastActiveAt is written at most this often per user. */
const TOUCH_EVERY_MS = 60_000;

/**
 * Reads a workspace's Settings › Security (defaults when never saved; cached 30 s, dropped on save) and applies
 * the parts that aren't login-specific: the password policy and the admin idle-session timeout.
 */
@Injectable()
export class SecurityPolicyService {
  private readonly cache = new Map<string, { at: number; value: SecuritySettings }>();
  private readonly touched = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  async security(tenantId: string | null): Promise<SecuritySettings> {
    const key = scopeKeyOf(tenantId);
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
    const row = await this.prisma.workspaceSettings.findUnique({ where: { scopeKey: key }, select: { security: true } });
    const value = mergeSection("security", row?.security ?? null);
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }

  /** Call after Settings › Security is saved so the new rules apply right away. */
  forget(tenantId: string | null) {
    this.cache.delete(scopeKeyOf(tenantId));
  }

  /** 400 with the policy's reasons when `password` doesn't meet the workspace's password policy. */
  async assertPassword(tenantId: string | null, password: string): Promise<void> {
    const errors = passwordPolicyErrors(password, await this.security(tenantId));
    if (errors.length) throw new BadRequestException(errors);
  }

  /** Length for generated passwords so they always satisfy the policy. */
  async generatedPasswordLength(tenantId: string | null): Promise<number> {
    return Math.max(12, (await this.security(tenantId)).passwordMinLength);
  }

  /**
   * Admin idle timeout: false when the admin has been inactive longer than the workspace's session timeout
   * (the token is then refused); otherwise records the activity (throttled) and returns true.
   */
  async touchAdminSession(userId: string, tenantId: string | null): Promise<boolean> {
    const now = Date.now();
    const last = this.touched.get(userId);
    if (last && now - last < TOUCH_EVERY_MS) return true;
    const [user, security] = await Promise.all([this.prisma.user.findUnique({ where: { id: userId }, select: { lastActiveAt: true } }), this.security(tenantId)]);
    if (!user) return false;
    if (isIdleExpired(user.lastActiveAt, security.sessionTimeoutMinutes, new Date(now))) {
      this.touched.delete(userId);
      return false;
    }
    await this.prisma.user.update({ where: { id: userId }, data: { lastActiveAt: new Date(now) } });
    this.touched.set(userId, now);
    return true;
  }
}

@Global()
@Module({ imports: [PrismaModule], providers: [SecurityPolicyService], exports: [SecurityPolicyService] })
export class SecurityPolicyModule {}
