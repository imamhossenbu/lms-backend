import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { authenticator } from "otplib";
import * as QRCode from "qrcode";
import { decryptSecret, encryptSecret } from "../common/crypto";
import { PrismaService } from "../prisma/prisma.service";

/** Accept the previous / next 30-second step too, to tolerate clock drift. */
authenticator.options = { window: 1 };

const ISSUER = "EduPro";

/**
 * TOTP two-factor authentication (Google Authenticator, 1Password, Authy…).
 * Flow: setup (secret + QR, not yet active) → enable (confirm a code) → login asks for a code → disable (needs a code).
 * Secrets are stored encrypted (common/crypto.ts).
 */
@Injectable()
export class TwoFactorService {
  constructor(private readonly prisma: PrismaService) {}

  private async mustUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, twoFactorEnabled: true, twoFactorSecret: true, deletedAt: true },
    });
    if (!user || user.deletedAt) throw new NotFoundException("Account not found.");
    return user;
  }

  /** True when `code` is a valid current code for the stored secret. */
  verify(encryptedSecret: string | null, code: string): boolean {
    if (!encryptedSecret || !/^\d{6}$/.test(code)) return false;
    try {
      return authenticator.check(code, decryptSecret(encryptedSecret));
    } catch {
      return false;
    }
  }

  async status(userId: string) {
    const user = await this.mustUser(userId);
    return { enabled: user.twoFactorEnabled };
  }

  /** Starts enrolment: a fresh secret (replacing any unconfirmed one) + otpauth URL + QR code image. */
  async setup(userId: string) {
    const user = await this.mustUser(userId);
    if (user.twoFactorEnabled) throw new ConflictException("Two-factor authentication is already on. Turn it off first to set it up again.");
    const secret = authenticator.generateSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { twoFactorSecret: encryptSecret(secret) } });
    const otpauthUrl = authenticator.keyuri(user.email, ISSUER, secret);
    return { secret, otpauthUrl, qrCodeDataUrl: await QRCode.toDataURL(otpauthUrl) };
  }

  /** Confirms enrolment with a code from the app. */
  async enable(userId: string, code: string) {
    const user = await this.mustUser(userId);
    if (user.twoFactorEnabled) throw new ConflictException("Two-factor authentication is already on.");
    if (!user.twoFactorSecret) throw new BadRequestException("Start the setup first to get a QR code.");
    if (!this.verify(user.twoFactorSecret, code)) throw new BadRequestException("That code didn't match. Check your authenticator app and try again.");

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { twoFactorEnabled: true, twoFactorEnabledAt: new Date() } });
      const member = await tx.teamMember.findUnique({ where: { userId }, select: { id: true, institutionId: true } });
      if (member)
        await tx.teamEvent.create({
          data: { institutionId: member.institutionId, type: "TWO_FA_ENABLED", actorId: userId, actorName: user.name, targetId: member.id, targetName: user.name, detail: "Authenticator app connected" },
        });
    });
    return { enabled: true };
  }

  /** Turns 2FA off — requires a current code so a stolen session alone can't disable it. */
  async disable(userId: string, code: string) {
    const user = await this.mustUser(userId);
    if (!user.twoFactorEnabled) throw new BadRequestException("Two-factor authentication is already off.");
    if (!this.verify(user.twoFactorSecret, code)) throw new BadRequestException("That code didn't match. Check your authenticator app and try again.");
    await this.prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorEnabledAt: null } });
    return { enabled: false };
  }
}
