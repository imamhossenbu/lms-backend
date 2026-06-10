import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import {
  RegisterDto,
  LoginDto,
  ChangePasswordDto,
  ResetPasswordDto,
} from "./dto/auth.dto";
import { MailService } from "./mail/mail.service";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private mailService: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const token = Math.random().toString(36).substring(2);

    const user = await this.prisma.user.create({
      data: {
        ...dto,
        password: hashedPassword,
        verificationToken: token,
        role: "STUDENT",
        status: "PENDING",
      },
    });

    await this.mailService.sendVerificationEmail(user.email, token);

    return { message: "Registration successful, please check your email" };
  }

  async verifyEmail(token: string) {
    const user = await this.prisma.user.findUnique({
      where: { verificationToken: token },
    });

    if (!user) {
      throw new NotFoundException("Invalid verification token");
    }

    return await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verificationToken: null,
        status: "ACTIVE",
      },
    });
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException("Invalid credentials");
    }

    if (user.status === "BLOCKED") {
      throw new UnauthorizedException(
        "Your account has been blocked by the administrator",
      );
    }

    if (!user.emailVerified) {
      throw new UnauthorizedException("Please verify your email first");
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      token: this.jwt.sign({
        sub: user.id,
        email: user.email,
        role: user.role,
      }),
    };
  }

  // Change Password
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException("User not found");
    }

    const isMatch = await bcrypt.compare(dto.currentPassword, user.password);

    if (!isMatch) throw new UnauthorizedException("Incorrect current password");

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    await this.mailService.sendSecurityAlertEmail(
      user.email,
      "successfully changed",
    );
    return { message: "Password updated successfully" };
  }

  // Forgot Password
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new NotFoundException("User not found");

    const resetToken = Math.random().toString(36).substring(2);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { verificationToken: resetToken },
    });

    await this.mailService.sendResetPasswordEmail(user.email, resetToken);
    return { message: "Reset link sent to your email" };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { verificationToken: dto.token },
    });

    if (!user) {
      throw new NotFoundException("Invalid or expired token");
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        verificationToken: null,
      },
    });

    return { message: "Password reset successful" };
  }
}
