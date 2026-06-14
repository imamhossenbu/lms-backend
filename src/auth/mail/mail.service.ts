import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";

@Injectable()
export class MailService {
  private resend: Resend;
  private fromName = "LMS Platform";
  private fromEmail: string;

  constructor(private configService: ConfigService) {
    this.resend = new Resend(this.configService.get<string>("RESEND_API_KEY"));
    this.fromEmail =
      this.configService.get<string>("MAIL_FROM") ?? "onboarding@resend.dev";

    console.log("MAIL SERVICE READY (Resend HTTP API)");
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
    const url = `http://localhost:4000/auth/verify?token=${token}`;

    const content = `
      <tr>
        <td style="padding: 32px 36px 16px 36px;">

          <div style="
            width: 48px; height: 48px;
            background: #eeecfe;
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
            margin: 0 0 28px 0;
            color: #52525b;
            font-size: 15px;
            line-height: 1.7;
          ">
            Welcome aboard! Click the button below to confirm your
            email address and activate your LMS account.
          </p>

          <table cellpadding="0" cellspacing="0" style="margin-bottom: 28px;">
            <tr>
              <td style="background: #534AB7; border-radius: 8px;">
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

    const { data, error } = await this.resend.emails.send({
      from: `${this.fromName} <${this.fromEmail}>`,
      to: email,
      subject: "Verify your email — LMS Platform",
      html: this.wrapTemplate(content, "#534AB7"),
    });

    if (error) console.log("Verification Email Error:", error);
    else console.log("Verification email sent:", data?.id);
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

    const { data, error } = await this.resend.emails.send({
      from: `LMS Security <${this.fromEmail}>`,
      to: email,
      subject: "Security Alert: Account Activity — LMS Platform",
      html: this.wrapTemplate(content, "#dc2626"),
    });

    if (error) console.log("Security Email Error:", error);
    else console.log("Security email sent:", data?.id);
  }

  // ===============================
  // RESET PASSWORD EMAIL
  // ===============================

  async sendResetPasswordEmail(email: string, token: string) {
    const url = `http://localhost:4000/auth/reset-password?token=${token}`;

    const content = `
      <tr>
        <td style="padding: 32px 36px 16px 36px;">

          <div style="
            width: 48px; height: 48px;
            background: #f0fdf4;
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
            margin: 0 0 28px 0;
            color: #52525b;
            font-size: 15px;
            line-height: 1.7;
          ">
            We received a request to reset the password for your LMS account.
            Click the button below to choose a new password.
          </p>

          <table cellpadding="0" cellspacing="0" style="margin-bottom: 28px;">
            <tr>
              <td style="background: #16a34a; border-radius: 8px;">
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

    const { data, error } = await this.resend.emails.send({
      from: `LMS Support <${this.fromEmail}>`,
      to: email,
      subject: "Reset your password — LMS Platform",
      html: this.wrapTemplate(content, "#16a34a"),
    });

    if (error) console.log("Reset Password Email Error:", error);
    else console.log("Reset password email sent:", data?.id);
  }
}
