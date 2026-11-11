import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;
  private fromName = "LMS Platform";
  private fromEmail: string;

  constructor(private configService: ConfigService) {
    // Credentials come from the environment only — never commit secrets as fallbacks.
    const user = this.configService.get<string>("MAIL_USER") ?? "";
    const pass = (this.configService.get<string>("MAIL_PASS") ?? "").replace(/\s+/g, "");
    this.fromEmail = this.configService.get<string>("MAIL_FROM") || user;

    if (!user || !pass) {
      console.warn("MAIL SERVICE: MAIL_USER / MAIL_PASS are not set — emails will fail to send.");
    }

    this.transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });
  }

  // ===============================
  // SHARED TEMPLATE WRAPPER
  // ===============================

  private wrapTemplate(content: string, accentColor = "#534AB7"): string {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>LMS Platform</title>
    </head>
    <body style="
      margin: 0;
      padding: 0;
      background-color: #f4f4f7;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    ">
      <table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 16px;">
        <tr>
          <td align="center">

            <table width="560" cellpadding="0" cellspacing="0" style="
              max-width: 560px;
              width: 100%;
              background: #ffffff;
              border-radius: 12px;
              overflow: hidden;
              border: 1px solid #e4e4e7;
            ">

              <!-- TOP ACCENT -->
              <tr>
                <td style="height: 3px; background: ${accentColor};"></td>
              </tr>

              <!-- HEADER -->
              <tr>
                <td style="padding: 28px 36px 0 36px;">
                  <span style="
                    background: ${accentColor};
                    color: #ffffff;
                    font-size: 11px;
                    font-weight: 600;
                    letter-spacing: 1.2px;
                    text-transform: uppercase;
                    padding: 5px 12px;
                    border-radius: 6px;
                  ">LMS Platform</span>
                </td>
              </tr>

              <!-- CONTENT -->
              ${content}

              <!-- FOOTER -->
              <tr>
                <td style="padding: 0 36px 32px 36px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="border-top: 1px solid #e4e4e7; padding-top: 20px;">
                        <p style="
                          margin: 0;
                          color: #a1a1aa;
                          font-size: 12px;
                          line-height: 1.6;
                          text-align: center;
                        ">
                          © 2026 LMS Platform. All rights reserved.<br/>
                          You received this because you have an account with us.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

            </table>

          </td>
        </tr>
      </table>
    </body>
    </html>
    `;
  }

  // ===============================
  // VERIFY EMAIL
  // ===============================

  async sendVerificationEmail(email: string, token: string) {
    const frontendUrl =
      this.configService.get<string>("FRONTEND_URL") || "http://localhost:3000";
    const url = `${frontendUrl}/verify-email?token=${token}&email=${encodeURIComponent(email)}`;

    const content = `
      <tr>
        <td style="padding: 32px 36px 16px 36px;">

          <div style="
            width: 48px; height: 48px;
            background: #FFF4ED;
            border-radius: 10px;
            font-size: 22px;
            line-height: 48px;
            text-align: center;
            margin-bottom: 24px;
          ">✉️</div>

          <h1 style="
            margin: 0 0 10px 0;
            color: #18181b;
            font-size: 22px;
            font-weight: 700;
            line-height: 1.3;
          ">Verify your email</h1>

          <p style="
            margin: 0 0 20px 0;
            color: #52525b;
            font-size: 15px;
            line-height: 1.7;
          ">
            Welcome to EduPro LMS! Enter the 6-digit verification code below on the verification page, or click the direct button to activate your account.
          </p>

          <div style="
            text-align: center;
            background: #FFF4ED;
            border: 1.5px dashed #FF5B00;
            border-radius: 12px;
            padding: 16px 20px;
            margin-bottom: 24px;
          ">
            <span style="
              display: inline-block;
              font-size: 32px;
              font-weight: 800;
              letter-spacing: 6px;
              color: #FF5B00;
              font-family: monospace;
            ">${token}</span>
            <p style="margin: 6px 0 0 0; color: #71717a; font-size: 12px;">6-digit verification code</p>
          </div>

          <table cellpadding="0" cellspacing="0" style="margin-bottom: 28px;">
            <tr>
              <td style="background: #FF5B00; border-radius: 8px;">
                <a href="${url}" style="
                  display: inline-block;
                  padding: 13px 28px;
                  color: #ffffff;
                  font-size: 15px;
                  font-weight: 600;
                  text-decoration: none;
                ">Verify email address →</a>
              </td>
            </tr>
          </table>

          <table width="100%" cellpadding="0" cellspacing="0" style="
            background: #f9f9fb;
            border-radius: 8px;
            border: 1px solid #e4e4e7;
            margin-bottom: 28px;
          ">
            <tr>
              <td style="padding: 14px 16px;">
                <p style="margin: 0 0 4px 0; color: #a1a1aa; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">
                  Or copy this link
                </p>
                <p style="margin: 0; color: #534AB7; font-size: 12px; word-break: break-all; font-family: monospace;">
                  ${url}
                </p>
              </td>
            </tr>
          </table>

          <p style="margin: 0 0 36px 0; color: #a1a1aa; font-size: 13px; line-height: 1.6;">
            Didn't create an account? You can safely ignore this email.
          </p>

        </td>
      </tr>
    `;

    try {
      const info = await this.transporter.sendMail({
        from: `"${this.fromName}" <${this.fromEmail}>`,
        to: email,
        subject: "Verify your email — LMS Platform",
        html: this.wrapTemplate(content, "#534AB7"),
      });
      console.log("Verification email sent:", info.messageId);
    } catch (error) {
      console.error("Verification Email Error:", error);
    }
  }

  // ===============================
  // ACCOUNT WELCOME (admin-created student / instructor)
  // ===============================

  async sendAccountWelcomeEmail(email: string, name: string, password: string, accountType: "student" | "instructor") {
    const frontendUrl = this.configService.get<string>("FRONTEND_URL") || "http://localhost:3000";
    const escape = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

    const content = `
      <tr>
        <td style="padding: 32px 36px 24px 36px;">
          <h1 style="margin: 0 0 12px; font-size: 22px; color: #0F172A;">Welcome, ${escape(name)}!</h1>
          <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #334155;">
            Your ${accountType} account has been created. Sign in with the details below and change your password after your first login.
          </p>
          <table cellpadding="0" cellspacing="0" style="width: 100%; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px;">
            <tr><td style="padding: 16px 20px; font-size: 14px; color: #64748B;">Email</td>
                <td style="padding: 16px 20px; font-size: 14px; color: #0F172A; font-weight: 600;">${escape(email)}</td></tr>
            <tr><td style="padding: 0 20px 16px; font-size: 14px; color: #64748B;">Password</td>
                <td style="padding: 0 20px 16px; font-size: 15px; color: #0F172A; font-weight: 600; font-family: monospace;">${escape(password)}</td></tr>
          </table>
          <a href="${frontendUrl}/login" style="display: inline-block; margin-top: 24px; padding: 12px 24px; background: #F97316; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
            Sign in
          </a>
        </td>
      </tr>`;

    await this.transporter.sendMail({
      from: `"${this.fromName}" <${this.fromEmail}>`,
      to: email,
      subject: `Your ${accountType} account is ready — LMS Platform`,
      html: this.wrapTemplate(content, "#F97316"),
    });
  }

  // ===============================
  // DIRECT MESSAGE FROM AN ADMIN
  // ===============================

  async sendAdminMessageEmail(email: string, recipientName: string, senderName: string, subject: string, body: string) {
    const escape = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
    const content = `
      <tr>
        <td style="padding: 32px 36px 24px 36px;">
          <p style="margin: 0 0 8px; font-size: 13px; color: #64748B;">Message from ${escape(senderName)}</p>
          <h1 style="margin: 0 0 16px; font-size: 20px; color: #0F172A;">${escape(subject)}</h1>
          <p style="margin: 0 0 16px; font-size: 15px; color: #334155;">Hi ${escape(recipientName)},</p>
          <div style="font-size: 15px; line-height: 1.7; color: #334155; white-space: pre-line;">${escape(body)}</div>
        </td>
      </tr>`;
    await this.transporter.sendMail({
      from: `"${this.fromName}" <${this.fromEmail}>`,
      to: email,
      subject,
      html: this.wrapTemplate(content, "#F97316"),
    });
  }

  // ===============================
  // TEAM INVITATION
  // ===============================

  async sendTeamInviteEmail(email: string, inviterName: string, workspaceName: string, roleName: string, message: string, link: string, expiresAt: Date) {
    const escape = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
    const expires = expiresAt.toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" });
    const content = `
      <tr>
        <td style="padding: 32px 36px 24px 36px;">
          <h1 style="margin: 0 0 12px; font-size: 22px; color: #0F172A;">You're invited to join ${escape(workspaceName)}</h1>
          <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #334155;">
            ${escape(inviterName)} invited you to the admin team as <strong>${escape(roleName)}</strong>.
          </p>
          ${message ? `<blockquote style="margin: 0 0 16px; padding: 12px 16px; background: #F8FAFC; border-left: 3px solid #F97316; color: #334155; font-size: 14px; white-space: pre-line;">${escape(message)}</blockquote>` : ""}
          <a href="${link}" style="display: inline-block; margin-top: 8px; padding: 12px 24px; background: #F97316; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">Accept invitation</a>
          <p style="margin: 20px 0 0; font-size: 13px; color: #64748B;">This link expires on ${expires}. If you weren't expecting it, you can ignore this email.</p>
        </td>
      </tr>`;
    await this.transporter.sendMail({
      from: `"${this.fromName}" <${this.fromEmail}>`,
      to: email,
      subject: `${inviterName} invited you to ${workspaceName}`,
      html: this.wrapTemplate(content, "#F97316"),
    });
  }

  // ===============================
  // 2FA REMINDER
  // ===============================

  async sendTwoFactorReminderEmail(email: string, name: string, senderName: string, link: string) {
    const escape = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
    const content = `
      <tr>
        <td style="padding: 32px 36px 24px 36px;">
          <h1 style="margin: 0 0 12px; font-size: 20px; color: #0F172A;">Please turn on two-factor authentication</h1>
          <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #334155;">
            Hi ${escape(name)}, ${escape(senderName)} asked every admin to protect their account with an authenticator app. It takes about a minute.
          </p>
          <a href="${link}" style="display: inline-block; padding: 12px 24px; background: #F97316; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">Set up 2FA</a>
        </td>
      </tr>`;
    await this.transporter.sendMail({
      from: `"${this.fromName}" <${this.fromEmail}>`,
      to: email,
      subject: "Action needed: turn on two-factor authentication",
      html: this.wrapTemplate(content, "#F97316"),
    });
  }

  // ===============================
  // ORDER RECEIPT
  // ===============================

  /** Academy website sign-up: 6-digit code, branded with the academy's name (no panel link). */
  async sendAcademyVerificationCode(email: string, name: string, code: string, academyName: string) {
    const escape = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
    const content = `
      <tr>
        <td style="padding: 32px 36px 24px 36px;">
          <h1 style="margin: 0 0 12px; font-size: 20px; color: #0F172A;">Hi ${escape(name)}, confirm your email</h1>
          <p style="margin: 0 0 20px; color: #52525b; font-size: 15px; line-height: 1.7;">Enter this code on ${escape(academyName)} to finish creating your account.</p>
          <div style="text-align: center; background: #FFF4ED; border: 1.5px dashed #FF5B00; border-radius: 12px; padding: 16px 20px; font-size: 30px; font-weight: 700; letter-spacing: 8px; color: #0F172A;">${escape(code)}</div>
          <p style="margin: 20px 0 0; color: #94a3b8; font-size: 13px;">If you didn't sign up, you can ignore this email.</p>
        </td>
      </tr>`;
    await this.transporter.sendMail({
      from: `"${academyName.replace(/"/g, "")}" <${this.fromEmail}>`,
      to: email,
      subject: `${code} is your ${academyName} verification code`,
      html: this.wrapTemplate(content, "#F97316"),
    });
  }

  /** Academy website password reset: 6-digit code (valid 30 minutes). */
  async sendAcademyResetCode(email: string, name: string, code: string, academyName: string) {
    const escape = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
    const content = `
      <tr>
        <td style="padding: 32px 36px 24px 36px;">
          <h1 style="margin: 0 0 12px; font-size: 20px; color: #0F172A;">Reset your ${escape(academyName)} password</h1>
          <p style="margin: 0 0 20px; color: #52525b; font-size: 15px; line-height: 1.7;">Hi ${escape(name)}, enter this code to choose a new password. It expires in 30 minutes.</p>
          <div style="text-align: center; background: #FFF4ED; border: 1.5px dashed #FF5B00; border-radius: 12px; padding: 16px 20px; font-size: 30px; font-weight: 700; letter-spacing: 8px; color: #0F172A;">${escape(code)}</div>
          <p style="margin: 20px 0 0; color: #94a3b8; font-size: 13px;">Didn't ask for this? You can ignore this email — your password stays the same.</p>
        </td>
      </tr>`;
    await this.transporter.sendMail({
      from: `"${academyName.replace(/"/g, "")}" <${this.fromEmail}>`,
      to: email,
      subject: `${code} is your ${academyName} password reset code`,
      html: this.wrapTemplate(content, "#F97316"),
    });
  }

  async sendOrderReceiptEmail(email: string, name: string, orderNumber: string, courseTitle: string, amount: number, currency: string, invoiceUrl: string) {
    const escape = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
    const total = `${currency} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const content = `
      <tr>
        <td style="padding: 32px 36px 24px 36px;">
          <h1 style="margin: 0 0 12px; font-size: 20px; color: #0F172A;">Thanks for your purchase, ${escape(name)}!</h1>
          <table cellpadding="0" cellspacing="0" style="width: 100%; margin: 8px 0 20px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px;">
            <tr><td style="padding: 12px 20px; font-size: 14px; color: #64748B;">Order</td><td style="padding: 12px 20px; font-size: 14px; color: #0F172A; font-weight: 600;">${escape(orderNumber)}</td></tr>
            <tr><td style="padding: 0 20px 12px; font-size: 14px; color: #64748B;">Course</td><td style="padding: 0 20px 12px; font-size: 14px; color: #0F172A;">${escape(courseTitle)}</td></tr>
            <tr><td style="padding: 0 20px 12px; font-size: 14px; color: #64748B;">Total paid</td><td style="padding: 0 20px 12px; font-size: 14px; color: #0F172A; font-weight: 600;">${escape(total)}</td></tr>
          </table>
          <a href="${invoiceUrl}" style="display: inline-block; padding: 12px 24px; background: #F97316; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">Download invoice (PDF)</a>
        </td>
      </tr>`;
    await this.transporter.sendMail({
      from: `"${this.fromName}" <${this.fromEmail}>`,
      to: email,
      subject: `Your receipt for ${orderNumber}`,
      html: this.wrapTemplate(content, "#F97316"),
    });
  }

  // ===============================
  // SECURITY ALERT EMAIL
  // ===============================

  async sendSecurityAlertEmail(email: string, action: string) {
    const content = `
      <tr>
        <td style="padding: 32px 36px 16px 36px;">

          <div style="
            width: 48px; height: 48px;
            background: #fef2f2;
            border-radius: 10px;
            font-size: 22px;
            line-height: 48px;
            text-align: center;
            margin-bottom: 20px;
          ">🔐</div>

          <table cellpadding="0" cellspacing="0" style="margin-bottom: 16px;">
            <tr>
              <td style="
                background: #fef2f2;
                border: 1px solid #fecaca;
                border-radius: 6px;
                padding: 4px 10px;
              ">
                <span style="color: #dc2626; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;">
                  Security Alert
                </span>
              </td>
            </tr>
          </table>

          <h1 style="
            margin: 0 0 10px 0;
            color: #18181b;
            font-size: 22px;
            font-weight: 700;
            line-height: 1.3;
          ">Account activity detected</h1>

          <p style="
            margin: 0 0 24px 0;
            color: #52525b;
            font-size: 15px;
            line-height: 1.7;
          ">
            We noticed a security change on your account. Here's what happened:
          </p>

          <table width="100%" cellpadding="0" cellspacing="0" style="
            background: #f9f9fb;
            border-radius: 8px;
            border: 1px solid #e4e4e7;
            margin-bottom: 20px;
          ">
            <tr>
              <td style="padding: 18px 20px;">
                <p style="margin: 0 0 4px 0; color: #a1a1aa; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Action</p>
                <p style="margin: 0; color: #18181b; font-size: 15px; font-weight: 600;">Password was ${action}</p>
              </td>
            </tr>
          </table>

          <table width="100%" cellpadding="0" cellspacing="0" style="
            background: #fef2f2;
            border-radius: 8px;
            border: 1px solid #fecaca;
            margin-bottom: 36px;
          ">
            <tr>
              <td style="padding: 14px 16px;">
                <p style="margin: 0; color: #dc2626; font-size: 13px; line-height: 1.6;">
                  ⚠️ If this wasn't you, please contact our support team immediately and secure your account.
                </p>
              </td>
            </tr>
          </table>

        </td>
      </tr>
    `;

    try {
      const info = await this.transporter.sendMail({
        from: `"LMS Security" <${this.fromEmail}>`,
        to: email,
        subject: "Security Alert: Account Activity — LMS Platform",
        html: this.wrapTemplate(content, "#dc2626"),
      });
      console.log("Security email sent:", info.messageId);
    } catch (error) {
      console.error("Security Email Error:", error);
    }
  }

  // ===============================
  // RESET PASSWORD EMAIL
  // ===============================

  async sendResetPasswordEmail(email: string, token: string) {
    const frontendUrl =
      this.configService.get<string>("FRONTEND_URL") || "http://localhost:3000";
    const url = `${frontendUrl}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;

    const content = `
      <tr>
        <td style="padding: 32px 36px 16px 36px;">

          <div style="
            width: 48px; height: 48px;
            background: #FFF4ED;
            border-radius: 10px;
            font-size: 22px;
            line-height: 48px;
            text-align: center;
            margin-bottom: 24px;
          ">🔑</div>

          <h1 style="
            margin: 0 0 10px 0;
            color: #18181b;
            font-size: 22px;
            font-weight: 700;
            line-height: 1.3;
          ">Reset your password</h1>

          <p style="
            margin: 0 0 20px 0;
            color: #52525b;
            font-size: 15px;
            line-height: 1.7;
          ">
            We received a request to reset the password for your EduPro LMS account.
            Click the button below to choose a new password, or use the 6-digit verification code.
          </p>

          <div style="
            text-align: center;
            background: #FFF4ED;
            border: 1.5px dashed #FF5B00;
            border-radius: 12px;
            padding: 16px 20px;
            margin-bottom: 24px;
          ">
            <span style="
              display: inline-block;
              font-size: 32px;
              font-weight: 800;
              letter-spacing: 6px;
              color: #FF5B00;
              font-family: monospace;
            ">${token}</span>
            <p style="margin: 6px 0 0 0; color: #71717a; font-size: 12px;">Reset security code</p>
          </div>

          <table cellpadding="0" cellspacing="0" style="margin-bottom: 28px;">
            <tr>
              <td style="background: #FF5B00; border-radius: 8px;">
                <a href="${url}" style="
                  display: inline-block;
                  padding: 13px 28px;
                  color: #ffffff;
                  font-size: 15px;
                  font-weight: 600;
                  text-decoration: none;
                ">Reset password →</a>
              </td>
            </tr>
          </table>

          <table width="100%" cellpadding="0" cellspacing="0" style="
            background: #f9f9fb;
            border-radius: 8px;
            border: 1px solid #e4e4e7;
            margin-bottom: 20px;
          ">
            <tr>
              <td style="padding: 14px 16px;">
                <p style="margin: 0 0 4px 0; color: #a1a1aa; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">
                  Or copy this link
                </p>
                <p style="margin: 0; color: #16a34a; font-size: 12px; word-break: break-all; font-family: monospace;">
                  ${url}
                </p>
              </td>
            </tr>
          </table>

          <table width="100%" cellpadding="0" cellspacing="0" style="
            background: #fffbeb;
            border-radius: 8px;
            border: 1px solid #fde68a;
            margin-bottom: 36px;
          ">
            <tr>
              <td style="padding: 14px 16px;">
                <p style="margin: 0; color: #92400e; font-size: 13px; line-height: 1.6;">
                  ⏱ This link will expire in 1 hour. If you didn't request a reset, you can safely ignore this email.
                </p>
              </td>
            </tr>
          </table>

        </td>
      </tr>
    `;

    try {
      const info = await this.transporter.sendMail({
        from: `"LMS Support" <${this.fromEmail}>`,
        to: email,
        subject: "Reset your password — LMS Platform",
        html: this.wrapTemplate(content, "#16a34a"),
      });
      console.log("Reset password email sent:", info.messageId);
    } catch (error) {
      console.error("Reset Password Email Error:", error);
    }
  }

  // ===============================
  // CERTIFICATE ISSUED EMAIL
  // ===============================

  async sendCertificateEmail(
    email: string,
    userName: string,
    courseName: string,
    certificateUrl: string,
    certNumber: string,
  ) {
    const content = `
      <tr>
        <td style="padding: 32px 36px 16px 36px;">

          <div style="
            width: 48px; height: 48px;
            background: #fff7ed;
            border-radius: 10px;
            font-size: 22px;
            line-height: 48px;
            text-align: center;
            margin-bottom: 24px;
          ">🏆</div>

          <h1 style="
            margin: 0 0 10px 0;
            color: #18181b;
            font-size: 22px;
            font-weight: 700;
            line-height: 1.3;
          ">Congratulations!</h1>

          <p style="
            margin: 0 0 28px 0;
            color: #52525b;
            font-size: 15px;
            line-height: 1.7;
          ">
            You've successfully completed the course <strong>${courseName}</strong>! 
            Your dedication and hard work have paid off. We are proud to award 
            you this certificate.
          </p>

          <table cellpadding="0" cellspacing="0" style="margin-bottom: 28px;">
            <tr>
              <td style="background: #C8981E; border-radius: 8px;">
                <a href="${certificateUrl}" style="
                  display: inline-block;
                  padding: 13px 28px;
                  color: #ffffff;
                  font-size: 15px;
                  font-weight: 600;
                  text-decoration: none;
                ">Download Certificate →</a>
              </td>
            </tr>
          </table>

          <table width="100%" cellpadding="0" cellspacing="0" style="
            background: #f9f9fb;
            border-radius: 8px;
            border: 1px solid #e4e4e7;
            margin-bottom: 36px;
          ">
            <tr>
              <td style="padding: 14px 16px;">
                <p style="margin: 0 0 4px 0; color: #a1a1aa; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">
                  Certificate Number
                </p>
                <p style="margin: 0; color: #C8981E; font-size: 14px; font-weight: 600; font-family: monospace;">
                  ${certNumber}
                </p>
              </td>
            </tr>
          </table>

        </td>
      </tr>
    `;

    try {
      const info = await this.transporter.sendMail({
        from: `"LMS Achievement" <${this.fromEmail}>`,
        to: email,
        subject: `Achievement Unlocked: ${courseName} — LMS Platform`,
        html: this.wrapTemplate(content, "#C8981E"), // সার্টিফিকেটের সাথে সামঞ্জস্য রেখে গোল্ড কালার
      });
      console.log("Certificate email sent:", info.messageId);
    } catch (error) {
      console.error("Certificate Email Error:", error);
    }
  }
}
