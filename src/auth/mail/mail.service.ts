import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;
  private fromName = "LMS Platform";
  private fromEmail: string;

  constructor(private configService: ConfigService) {
    this.fromEmail =
      this.configService.get<string>("MAIL_FROM") ?? "imam.adsfixter@gmail.com";

    const user =
      this.configService.get<string>("MAIL_USER") || "imam.adsfixter@gmail.com";
    const pass = (
      this.configService.get<string>("MAIL_PASS") || "fjrvqrnhdicsckui"
    ).replace(/\s+/g, "");

    this.transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user,
        pass,
      },
    });

    console.log("MAIL SERVICE READY (Nodemailer Gmail SMTP)");
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
