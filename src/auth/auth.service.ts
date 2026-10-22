import {
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

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private mailService: MailService,
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
    const user = await this.prisma.user.findUnique({
      where: {
        verificationToken: token,
      },
    });

    if (!user) {
      throw new NotFoundException("Invalid or expired verification token");
    }

    return await this.prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        emailVerified: true,
        status: "ACTIVE",
        verificationToken: null,
      },
    });
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
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerified: true,
        },
      });

      return {
        success: true,
        message: "Code verified successfully! Proceed to reset your password.",
        resetToken: cleanCode,
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
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: {
        email: dto.email,
      },
    });

    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException("Invalid credentials");
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

    await this.prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        lastLoginAt: new Date(),
      },
    });

    return {
      token: this.jwt.sign({
        sub: user.id,
        email: user.email,
        role: user.role,
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

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        password: hashedPassword,
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

    if (!user || user.verificationToken !== cleanToken) {
      throw new NotFoundException("Invalid or expired reset token/code");
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        password: hashedPassword,
        verificationToken: null,
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
