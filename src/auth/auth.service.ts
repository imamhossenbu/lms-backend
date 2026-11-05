import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";

import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";

import { PrismaService } from "../prisma/prisma.service";

import {
  RegisterDto,
  LoginDto,
  ChangePasswordDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from "./dto/auth.dto";

import { MailService } from "./mail/mail.service";
import { TwoFactorService } from "./two-factor.service";
import { TeamAccessService } from "../team/services/team-access.service";
import { SecurityPolicyService } from "../workspace-settings/security-policy.service";
import { adminIpAllowed, afterFailedLogin, isPasswordExpired, lockMinutesLeft } from "../workspace-settings/security-policy";

const minutes = (n: number) => `${n} minute${n === 1 ? "" : "s"}`;

/** Purpose claim of the short-lived token between the password step and the 2FA code step. */
const TWO_FACTOR_CHALLENGE = "2fa-login";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private mailService: MailService,
    private twoFactor: TwoFactorService,
    private teamAccess: TeamAccessService,
    private securityPolicy: SecurityPolicyService,
  ) {}

  // REGISTER
  async register(dto: RegisterDto) {
    // CHECK EXISTING USER
    const existingUser = await this.prisma.user.findUnique({
      where: {
        email: dto.email,
      },
    });

    if (existingUser) {
      throw new BadRequestException("Email already exists");
    }

    await this.securityPolicy.assertPassword(null, dto.password);
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // Generate 6-digit numeric verification OTP
    const token = Math.floor(100000 + Math.random() * 900000).toString();

    const user = await this.prisma.user.create({
      data: {
        ...dto,
        password: hashedPassword,
        verificationToken: token,
        role: "STUDENT",
        status: "PENDING",
      },
    });

    // SEND EMAIL
    try {
      await this.mailService.sendVerificationEmail(user.email, token);
    } catch (error: any) {
      console.log("MAIL ERROR:", error.message);
    }

    return {
      message:
        "Registration successful. Please check your email for the 6-digit verification code.",
      email: user.email,
    };
  }

  // VERIFY EMAIL (Direct token query or link click)
  async verifyEmail(token: string) {
    if (!token || typeof token !== "string") throw new BadRequestException("Verification token is missing");
    const user = await this.prisma.user.findUnique({
      where: {
        verificationToken: token,
      },
    });

    if (!user) {
      throw new NotFoundException("Invalid or expired verification token");
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, status: "ACTIVE", verificationToken: null },
    });
    // Never echo the user row back (it holds the password hash).
    return { message: "Email verified successfully. You can now sign in.", email: user.email };
  }

  // VERIFY 6-DIGIT CODE (From verify-email OTP frontend input)
  async verifyCode(dto: VerifyEmailDto) {
    const cleanCode = dto.code.trim();
    let user: any = null;

    if (dto.email) {
      user = await this.prisma.user.findFirst({
        where: {
          email: { equals: dto.email.trim(), mode: "insensitive" },
        },
      });
    }

    if (!user) {
      user = await this.prisma.user.findFirst({
        where: { verificationToken: cleanCode },
      });
    }

    if (!user || user.verificationToken !== cleanCode) {
      throw new BadRequestException("Invalid or expired 6-digit verification code");
    }

    if (dto.purpose === "reset-password") {
      const resetSessionToken = this.jwt.sign(
        {
          sub: user.id,
          email: user.email,
          purpose: "reset-password",
        },
        { expiresIn: "15m" },
      );

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerified: true,
          verificationToken: cleanCode,
        },
      });

      return {
        success: true,
        message: "Code verified successfully! Proceed to reset your password.",
        resetToken: resetSessionToken,
        code: cleanCode,
        email: user.email,
      };
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        status: user.status === "PENDING" ? "ACTIVE" : user.status,
        verificationToken: null,
      },
    });

    return {
      success: true,
      message: "Email verified successfully! You may now access your dashboard.",
    };
  }

  // RESEND VERIFICATION CODE
  async resendVerification(email: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        email: { equals: email.trim(), mode: "insensitive" },
      },
    });

    if (!user) {
      throw new NotFoundException("Account with this email does not exist");
    }

    // Generate fresh 6-digit numeric OTP code
    const newCode = Math.floor(100000 + Math.random() * 900000).toString();

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        verificationToken: newCode,
      },
    });

    try {
      await this.mailService.sendVerificationEmail(user.email, newCode);
    } catch (err: any) {
      console.error("Resend Mail Error:", err.message);
    }

    return {
      success: true,
      message: "A fresh 6-digit verification code has been dispatched to your email",
    };
  }

  // LOGIN
  /**
   * Password step. Accounts with 2FA get `{ twoFactorRequired, challengeToken }` (valid 5 minutes) and finish
   * with POST /auth/2fa/login; everyone else gets `{ token, twoFactorSetupRequired }` straight away.
   * `twoFactorSetupRequired: true` = the workspace requires admin 2FA and this admin hasn't set it up:
   * the panel should open 2FA setup (other admin endpoints answer 403 until then).
   */
  async login(dto: LoginDto, ip?: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        email: dto.email,
      },
    });
    if (!user) throw new UnauthorizedException("Invalid credentials");

    // Settings › Security › Login protection: a locked account can't even try a password.
    const security = await this.securityPolicy.security(user.institutionId ?? null);
    const locked = lockMinutesLeft(user.lockedUntil);
    if (locked) throw new UnauthorizedException(`Too many failed sign-in attempts. Try again in ${minutes(locked)}.`);

    if (!(await bcrypt.compare(dto.password, user.password))) {
      const next = afterFailedLogin(user.failedLoginAttempts, security);
      await this.prisma.user.update({ where: { id: user.id }, data: next });
      if (next.lockedUntil) throw new UnauthorizedException(`Too many failed sign-in attempts. Your account is locked for ${minutes(security.lockoutMinutes)}.`);
      throw new UnauthorizedException("Invalid credentials");
    }

    if (user.deletedAt) {
      throw new UnauthorizedException("This account has been deleted");
    }

    if (!user.emailVerified) {
      throw new UnauthorizedException("Please verify your email first");
    }

    if (user.status === "PENDING") {
      throw new UnauthorizedException(
        "Your account is waiting for admin approval",
      );
    }

    if (user.status === "BLOCKED") {
      throw new UnauthorizedException("Your account has been blocked");
    }

    if (user.status === "INACTIVE") {
      throw new UnauthorizedException("Your account is inactive — contact your administrator");
    }

    // Tenant gate: when an institution is suspended or closed, only its admins may sign in
    // (to see the billing state and reactivate). Students and instructors are blocked.
    if (user.institutionId && user.role !== "ADMIN") {
      const institution = await this.prisma.institution.findUnique({
        where: { id: user.institutionId },
        select: { status: true },
      });
      if (institution?.status === "SUSPENDED") {
        throw new UnauthorizedException("Your institution's workspace is temporarily suspended — contact your administrator");
      }
      if (institution?.status === "CANCELLED") {
        throw new UnauthorizedException("Your institution's workspace has been closed — contact your administrator");
      }
    }

    // Admin-panel staff whose team access was suspended can't sign in.
    const membership = await this.prisma.teamMember.findUnique({ where: { userId: user.id }, select: { status: true } });
    if (membership?.status === "SUSPENDED") {
      throw new UnauthorizedException("Your team access has been suspended — contact the workspace owner");
    }

    // Settings › Security › IP allowlist: admin sign-ins only from the listed networks.
    if (user.role === "ADMIN" && !adminIpAllowed(ip, security)) {
      throw new ForbiddenException("Sign-ins from your network aren't allowed for this workspace. Ask the workspace owner to add your IP address.");
    }

    // Settings › Security › Password expiry.
    if (isPasswordExpired(user.passwordChangedAt, security.passwordExpiryDays)) {
      throw new UnauthorizedException("Your password has expired. Use \"Forgot password\" to choose a new one.");
    }

    // The right password ends a failed-attempts streak.
    if (user.failedLoginAttempts) await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0 } });

    if (user.twoFactorEnabled) {
      return {
        twoFactorRequired: true,
        challengeToken: this.jwt.sign({ sub: user.id, purpose: TWO_FACTOR_CHALLENGE }, { expiresIn: "5m" }),
      };
    }
    return this.issueSession(user, ip);
  }

  /** Second login step for 2FA accounts: challenge token from `login` + a 6-digit authenticator code. */
  async completeTwoFactorLogin(challengeToken: string, code: string, ip?: string) {
    let payload: { sub?: string; purpose?: string };
    try {
      payload = this.jwt.verify(challengeToken);
    } catch {
      throw new UnauthorizedException("Your sign-in session expired. Enter your email and password again.");
    }
    if (payload.purpose !== TWO_FACTOR_CHALLENGE || !payload.sub) throw new UnauthorizedException("Invalid sign-in session.");

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.deletedAt || !user.twoFactorEnabled) throw new UnauthorizedException("Invalid sign-in session.");
    if (!this.twoFactor.verify(user.twoFactorSecret, code)) throw new UnauthorizedException("That code didn't match. Check your authenticator app and try again.");
    return this.issueSession(user, ip);
  }

  /** Records the sign-in and returns the access token. */
  private async issueSession(user: { id: string; email: string; role: string; institutionId: string | null; twoFactorEnabled: boolean }, ip?: string) {
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastActiveAt: new Date(), failedLoginAttempts: 0, lockedUntil: null, ...(ip ? { lastLoginIp: ip } : {}) },
    });
    return {
      twoFactorSetupRequired: await this.teamAccess.twoFactorSetupRequiredAtLogin(user),
      token: this.jwt.sign({
        sub: user.id,
        email: user.email,
        role: user.role,
        institutionId: user.institutionId ?? null,
      }),
    };
  }

  // CHANGE PASSWORD
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    const isMatch = await bcrypt.compare(dto.currentPassword, user.password);

    if (!isMatch) {
      throw new UnauthorizedException("Incorrect current password");
    }

    await this.securityPolicy.assertPassword(user.institutionId ?? null, dto.newPassword);
    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        password: hashedPassword,
        passwordChangedAt: new Date(),
      },
    });

    // SEND SECURITY EMAIL
    try {
      await this.mailService.sendSecurityAlertEmail(
        user.email,
        "successfully changed",
      );
    } catch (error: any) {
      console.log("MAIL ERROR:", error.message);
    }

    return {
      message: "Password updated successfully",
    };
  }

  // FORGOT PASSWORD
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        email: { equals: email.trim(), mode: "insensitive" },
      },
    });

    if (!user) {
      throw new NotFoundException("User not found with this email");
    }

    // Generate 6-digit numeric security code
    const resetToken = Math.floor(100000 + Math.random() * 900000).toString();

    await this.prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        verificationToken: resetToken,
      },
    });

    // SEND RESET EMAIL
    try {
      await this.mailService.sendResetPasswordEmail(user.email, resetToken);
    } catch (error: any) {
      console.log("MAIL ERROR:", error.message);
    }

    return {
      success: true,
      message: "Password reset code and link dispatched to your email",
      email: user.email,
    };
  }

  // RESET PASSWORD
  async resetPassword(dto: ResetPasswordDto) {
    const cleanToken = dto.token.trim();
    let user: any = null;
    let isTokenVerified = false;

    // 1. Try resolving via signed JWT reset session token
    try {
      const decoded: any = this.jwt.verify(cleanToken);
      if (decoded?.sub) {
        user = await this.prisma.user.findUnique({
          where: { id: decoded.sub },
        });
        if (user) {
          isTokenVerified = true;
        }
      }
    } catch {
      // Not a JWT, check via verificationToken/email below
    }

    // 2. If not verified by JWT, verify by 6-digit OTP code (cleanToken)
    if (!isTokenVerified) {
      if (dto.email) {
        user = await this.prisma.user.findFirst({
          where: {
            email: { equals: dto.email.trim(), mode: "insensitive" },
          },
        });
      }

      if (!user) {
        user = await this.prisma.user.findFirst({
          where: { verificationToken: cleanToken },
        });
      }

      if (user && user.verificationToken === cleanToken) {
        isTokenVerified = true;
      }
    }

    if (!user || !isTokenVerified) {
      throw new NotFoundException("Invalid or expired reset token/code");
    }

    await this.securityPolicy.assertPassword(user.institutionId ?? null, dto.newPassword);
    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    // A reset also clears a lockout (the person proved they own the email).
    await this.prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        password: hashedPassword,
        verificationToken: null,
        passwordChangedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    try {
      await this.mailService.sendSecurityAlertEmail(
        user.email,
        "reset using verification code",
      );
    } catch (error: any) {
      console.log("MAIL ERROR:", error.message);
    }

    return {
      success: true,
      message: "Password reset successfully! You can now sign in with your new password.",
    };
  }
}
