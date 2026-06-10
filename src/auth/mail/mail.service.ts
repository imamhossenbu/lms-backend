import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>("MAIL_HOST"),
      port: this.configService.get<number>("MAIL_PORT"),
      secure: false, // true for port 465, false for other ports
      auth: {
        user: this.configService.get<string>("MAIL_USER"),
        pass: this.configService.get<string>("MAIL_PASS"),
      },
    });
  }

  async sendVerificationEmail(email: string, token: string) {
    const url = `http://localhost:4000/auth/verify?token=${token}`;

    await this.transporter.sendMail({
      from: '"LMS Platform" <support@lms.com>',
      to: email,
      subject: "Welcome to LMS - Please Verify Your Email",
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #f9f9f9;">
        <h2 style="color: #333; text-align: center;">Welcome to Our LMS!</h2>
        <p style="color: #555; font-size: 16px;">Hi there,</p>
        <p style="color: #555; font-size: 16px;">Thanks for signing up! To get started, please verify your email address by clicking the button below:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${url}" style="background-color: #007bff; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">Verify Email Address</a>
        </div>
        
        <p style="color: #888; font-size: 14px; text-align: center;">If you didn't create an account, you can safely ignore this email.</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #aaa; font-size: 12px; text-align: center;">© 2026 LMS Platform. All rights reserved.</p>
      </div>
    `,
    });
  }

  // Security Alert Template
  async sendSecurityAlertEmail(email: string, action: string) {
    await this.transporter.sendMail({
      from: '"LMS Security" <security@lms.com>',
      to: email,
      subject: "Security Alert: Account Activity",
      html: `
      <div style="font-family: Arial; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #d9534f;">Security Notification</h2>
        <p>Hello,</p>
        <p>Your account password was <strong>${action}</strong>. If this wasn't you, please contact our support team immediately.</p>
        <p style="color: #777;">Stay secure,<br>LMS Team</p>
      </div>
    `,
    });
  }

  // Reset Password Template
  async sendResetPasswordEmail(email: string, token: string) {
    const url = `http://localhost:4000/auth/reset-password?token=${token}`;
    await this.transporter.sendMail({
      from: '"LMS Support" <support@lms.com>',
      to: email,
      subject: "Reset Your Password",
      html: `
      <div style="font-family: Arial; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="text-align: center; color: #333;">Password Reset Request</h2>
        <p>We received a request to reset your password. Click the button below to proceed:</p>
        <div style="text-align: center; margin: 20px 0;">
          <a href="${url}" style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a>
        </div>
        <p style="font-size: 12px; color: #888;">This link will expire soon. If you didn't request this, ignore this email.</p>
      </div>
    `,
    });
  }
}
