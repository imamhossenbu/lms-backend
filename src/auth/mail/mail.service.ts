

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

  private wrapTemplate(content: string): string {
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
      background-color: #0f0f13;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    ">
      <table width="100%" cellpadding="0" cellspacing="0" style="padding: 48px 16px;">
        <tr>
          <td align="center">

            <!-- CARD -->
            <table width="600" cellpadding="0" cellspacing="0" style="
              max-width: 600px;
              width: 100%;
              background: #16161d;
              border-radius: 16px;
              overflow: hidden;
              border: 1px solid #2a2a3a;
            ">

              <!-- TOP ACCENT BAR -->
              <tr>
                <td style="
                  height: 4px;
                  background: linear-gradient(90deg, #6366f1 0%, #8b5cf6 50%, #06b6d4 100%);
                "></td>
              </tr>

              <!-- LOGO HEADER -->
              <tr>
                <td style="padding: 36px 40px 0 40px;">
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="
                        background: linear-gradient(135deg, #6366f1, #8b5cf6);
                        border-radius: 10px;
                        padding: 8px 16px;
                      ">
                        <span style="
                          color: #ffffff;
                          font-size: 13px;
                          font-weight: 700;
                          letter-spacing: 1.5px;
                          text-transform: uppercase;
                        ">LMS Platform</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- CONTENT -->
              ${content}

              <!-- FOOTER -->
              <tr>
                <td style="padding: 0 40px 36px 40px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="
                        border-top: 1px solid #2a2a3a;
                        padding-top: 24px;
                      ">
                        <p style="
                          margin: 0;
                          color: #4a4a6a;
                          font-size: 12px;
                          line-height: 1.6;
                          text-align: center;
                        ">
                          © 2026 LMS Platform. All rights reserved.<br/>
                          You received this email because you have an account with us.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

            </table>
            <!-- END CARD -->

          </td>
        </tr>
      </table>
    </body>
    </html>
    `;
  }

  // ===============================
  // VERIFY EMAIL TEMPLATE
  // ===============================

  async sendVerificationEmail(email: string, token: string) {
    const url = `http://localhost:4000/auth/verify?token=${token}`;

    const content = `
      <tr>
        <td style="padding: 36px 40px 16px 40px;">

          <!-- ICON -->
          <div style="
            width: 56px;
            height: 56px;
            background: linear-gradient(135deg, #1e1e2e, #2a2a3a);
            border-radius: 14px;
            border: 1px solid #3a3a5a;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 28px;
            font-size: 26px;
            line-height: 56px;
            text-align: center;
          ">✉️</div>

          <h1 style="
            margin: 0 0 12px 0;
            color: #f0f0ff;
            font-size: 26px;
            font-weight: 700;
            letter-spacing: -0.5px;
            line-height: 1.2;
          ">Verify your email</h1>

          <p style="
            margin: 0 0 28px 0;
            color: #8888aa;
            font-size: 15px;
            line-height: 1.7;
          ">
            Welcome aboard! Click the button below to confirm your email
            address and activate your LMS account.
          </p>

          <!-- CTA BUTTON -->
          <table cellpadding="0" cellspacing="0" style="margin-bottom: 32px;">
            <tr>
              <td style="
                background: linear-gradient(135deg, #6366f1, #8b5cf6);
                border-radius: 10px;
              ">
                <a href="${url}" style="
                  display: inline-block;
                  padding: 14px 32px;
                  color: #ffffff;
                  font-size: 15px;
                  font-weight: 600;
                  text-decoration: none;
                  letter-spacing: 0.2px;
                ">Verify Email Address →</a>
              </td>
            </tr>
          </table>

          <!-- FALLBACK LINK -->
          <table width="100%" cellpadding="0" cellspacing="0" style="
            background: #1e1e2e;
            border-radius: 10px;
            border: 1px solid #2a2a3a;
            margin-bottom: 32px;
          ">
            <tr>
              <td style="padding: 16px 20px;">
                <p style="margin: 0 0 6px 0; color: #6666aa; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">
                  Or copy this link
                </p>
                <p style="margin: 0; color: #6366f1; font-size: 12px; word-break: break-all; font-family: monospace;">
                  ${url}
                </p>
              </td>
            </tr>
          </table>

          <p style="margin: 0 0 40px 0; color: #4a4a6a; font-size: 13px; line-height: 1.6;">
            Didn't create an account? You can safely ignore this email.
          </p>

        </td>
      </tr>
    `;

    const { data, error } = await this.resend.emails.send({
      from: `${this.fromName} <${this.fromEmail}>`,
      to: email,
      subject: "Verify your email — LMS Platform",
      html: this.wrapTemplate(content),
    });

    if (error) {
      console.log("Verification Email Error:", error);
    } else {
      console.log("Verification email sent:", data?.id);
    }
  }

  // ===============================
  // SECURITY ALERT EMAIL
  // ===============================

  async sendSecurityAlertEmail(email: string, action: string) {
    const content = `
      <tr>
        <td style="padding: 36px 40px 16px 40px;">

          <!-- ICON -->
          <div style="
            width: 56px;
            height: 56px;
            background: linear-gradient(135deg, #2a1a1a, #3a1a1a);
            border-radius: 14px;
            border: 1px solid #5a2a2a;
            font-size: 26px;
            line-height: 56px;
            text-align: center;
            margin-bottom: 28px;
          ">🔐</div>

          <!-- ALERT BADGE -->
          <table cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
            <tr>
              <td style="
                background: rgba(239, 68, 68, 0.12);
                border: 1px solid rgba(239, 68, 68, 0.3);
                border-radius: 6px;
                padding: 5px 12px;
              ">
                <span style="color: #f87171; font-size: 12px; font-weight: 600; letter-spacing: 0.5px;">
                  SECURITY ALERT
                </span>
              </td>
            </tr>
          </table>

          <h1 style="
            margin: 0 0 12px 0;
            color: #f0f0ff;
            font-size: 26px;
            font-weight: 700;
            letter-spacing: -0.5px;
            line-height: 1.2;
          ">Account activity detected</h1>

          <p style="
            margin: 0 0 28px 0;
            color: #8888aa;
            font-size: 15px;
            line-height: 1.7;
          ">
            We noticed a security change on your account. Here's what happened:
          </p>

          <!-- ACTIVITY BOX -->
          <table width="100%" cellpadding="0" cellspacing="0" style="
            background: #1e1e2e;
            border-radius: 10px;
            border: 1px solid #2a2a3a;
            margin-bottom: 28px;
          ">
            <tr>
              <td style="padding: 20px 24px;">
                <p style="margin: 0 0 4px 0; color: #6666aa; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">
                  Action
                </p>
                <p style="margin: 0; color: #f0f0ff; font-size: 15px; font-weight: 600;">
                  Password was ${action}
                </p>
              </td>
            </tr>
          </table>

          <!-- WARNING BOX -->
          <table width="100%" cellpadding="0" cellspacing="0" style="
            background: rgba(239, 68, 68, 0.06);
            border-radius: 10px;
            border: 1px solid rgba(239, 68, 68, 0.2);
            margin-bottom: 36px;
          ">
            <tr>
              <td style="padding: 16px 20px;">
                <p style="margin: 0; color: #fca5a5; font-size: 13px; line-height: 1.6;">
                  ⚠️ If this wasn't you, please contact our support team immediately
                  and secure your account.
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
      html: this.wrapTemplate(content),
    });

    if (error) {
      console.log("Security Email Error:", error);
    } else {
      console.log("Security email sent:", data?.id);
    }
  }

  // ===============================
  // RESET PASSWORD EMAIL
  // ===============================

  async sendResetPasswordEmail(email: string, token: string) {
    const url = `http://localhost:4000/auth/reset-password?token=${token}`;

    const content = `
      <tr>
        <td style="padding: 36px 40px 16px 40px;">

          <!-- ICON -->
          <div style="
            width: 56px;
            height: 56px;
            background: linear-gradient(135deg, #1a2a1e, #1a3a26);
            border-radius: 14px;
            border: 1px solid #2a5a3a;
            font-size: 26px;
            line-height: 56px;
            text-align: center;
            margin-bottom: 28px;
          ">🔑</div>

          <h1 style="
            margin: 0 0 12px 0;
            color: #f0f0ff;
            font-size: 26px;
            font-weight: 700;
            letter-spacing: -0.5px;
            line-height: 1.2;
          ">Reset your password</h1>

          <p style="
            margin: 0 0 28px 0;
            color: #8888aa;
            font-size: 15px;
            line-height: 1.7;
          ">
            We received a request to reset the password for your LMS account.
            Click the button below to choose a new password.
          </p>

          <!-- CTA BUTTON -->
          <table cellpadding="0" cellspacing="0" style="margin-bottom: 32px;">
            <tr>
              <td style="
                background: linear-gradient(135deg, #059669, #10b981);
                border-radius: 10px;
              ">
                <a href="${url}" style="
                  display: inline-block;
                  padding: 14px 32px;
                  color: #ffffff;
                  font-size: 15px;
                  font-weight: 600;
                  text-decoration: none;
                  letter-spacing: 0.2px;
                ">Reset Password →</a>
              </td>
            </tr>
          </table>

          <!-- FALLBACK LINK -->
          <table width="100%" cellpadding="0" cellspacing="0" style="
            background: #1e1e2e;
            border-radius: 10px;
            border: 1px solid #2a2a3a;
            margin-bottom: 24px;
          ">
            <tr>
              <td style="padding: 16px 20px;">
                <p style="margin: 0 0 6px 0; color: #6666aa; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">
                  Or copy this link
                </p>
                <p style="margin: 0; color: #10b981; font-size: 12px; word-break: break-all; font-family: monospace;">
                  ${url}
                </p>
              </td>
            </tr>
          </table>

          <!-- EXPIRY WARNING -->
          <table width="100%" cellpadding="0" cellspacing="0" style="
            background: rgba(245, 158, 11, 0.06);
            border-radius: 10px;
            border: 1px solid rgba(245, 158, 11, 0.2);
            margin-bottom: 36px;
          ">
            <tr>
              <td style="padding: 14px 20px;">
                <p style="margin: 0; color: #fcd34d; font-size: 13px; line-height: 1.6;">
                  ⏱ This link will expire in 1 hour. If you didn't request a reset,
                  you can safely ignore this email.
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
      html: this.wrapTemplate(content),
    });

    if (error) {
      console.log("Reset Password Email Error:", error);
    } else {
      console.log("Reset password email sent:", data?.id);
    }
  }
}
