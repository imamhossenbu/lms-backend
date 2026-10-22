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
} from "./dto/auth.dto";
import { AuthGuard } from "@nestjs/passport";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async register(@Body() registerDto: RegisterDto) {
    return await this.authService.register(registerDto);
  }

  @Post("login")
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async login(@Body() loginDto: LoginDto) {
    return await this.authService.login(loginDto);
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
