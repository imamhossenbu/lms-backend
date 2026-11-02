import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  UsePipes,
  ValidationPipe,
  UseGuards,
  Req,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import {
  RegisterDto,
  LoginDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyEmailDto,
  ResendVerificationDto,
  TwoFactorCodeDto,
  TwoFactorLoginDto,
} from "./dto/auth.dto";
import { Throttle } from "@nestjs/throttler";
import { TwoFactorService } from "./two-factor.service";
import { CurrentUser, type AuthUser } from "../common/auth-user";
import { AuthGuard } from "@nestjs/passport";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  @Post("register")
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async register(@Body() registerDto: RegisterDto) {
    return await this.authService.register(registerDto);
  }

  @Post("login")
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async login(@Body() loginDto: LoginDto, @Req() req: any) {
    return await this.authService.login(loginDto, req.ip);
  }

  // ---------------------------------------------------------------- two-factor (TOTP)

  /** Second sign-in step for accounts with 2FA. */
  @Post("2fa/login")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async twoFactorLogin(@Body() dto: TwoFactorLoginDto, @Req() req: any) {
    return this.authService.completeTwoFactorLogin(dto.challengeToken, dto.code, req.ip);
  }

  @Get("2fa")
  @UseGuards(AuthGuard("jwt"))
  async twoFactorStatus(@CurrentUser() user: AuthUser) {
    return this.twoFactor.status(user.userId);
  }

  /** Starts enrolment: returns the secret, otpauth URL and a QR code to scan. */
  @Post("2fa/setup")
  @UseGuards(AuthGuard("jwt"))
  async twoFactorSetup(@CurrentUser() user: AuthUser) {
    return this.twoFactor.setup(user.userId);
  }

  @Post("2fa/enable")
  @UseGuards(AuthGuard("jwt"))
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async twoFactorEnable(@CurrentUser() user: AuthUser, @Body() dto: TwoFactorCodeDto) {
    return this.twoFactor.enable(user.userId, dto.code);
  }

  @Post("2fa/disable")
  @UseGuards(AuthGuard("jwt"))
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async twoFactorDisable(@CurrentUser() user: AuthUser, @Body() dto: TwoFactorCodeDto) {
    return this.twoFactor.disable(user.userId, dto.code);
  }

  // GET verify (Link click from email)
  @Get("verify")
  async verifyEmail(@Query("token") token: string) {
    return await this.authService.verifyEmail(token);
  }

  // POST verify (6-digit OTP code input from frontend verify-email page)
  @Post("verify")
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async verifyCode(@Body() dto: VerifyEmailDto) {
    return await this.authService.verifyCode(dto);
  }

  // POST verify-email (Alias for compatibility)
  @Post("verify-email")
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async verifyEmailPost(@Body() dto: VerifyEmailDto) {
    return await this.authService.verifyCode(dto);
  }

  // POST resend-verification (Resend 6-digit OTP to user email)
  @Post("resend-verification")
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async resendVerification(@Body() dto: ResendVerificationDto) {
    return await this.authService.resendVerification(dto.email);
  }

  @Post("change-password")
  @UseGuards(AuthGuard("jwt"))
  async changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    return await this.authService.changePassword(req.user.userId, dto);
  }

  @Post("forgot-password")
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return await this.authService.forgotPassword(dto.email);
  }

  @Post("reset-password")
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return await this.authService.resetPassword(dto);
  }
}
