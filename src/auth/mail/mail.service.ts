import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;
  private isMock: boolean = false;

  constructor(
    private configService: ConfigService,
  ) {
    this.transporter =
      nodemailer.createTransport({
        host: this.configService.get<string>(
          "MAIL_HOST",
        ),

        port: Number(
          this.configService.get<string>(
            "MAIL_PORT",
          ),
        ),

        secure: false,

        auth: {
          user: this.configService.get<string>(
            "MAIL_USER",
          ),

          pass: this.configService.get<string>(
            "MAIL_PASS",
          ),
        },

        tls: {
          rejectUnauthorized: false,
        },
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 5000,
      });

    // VERIFY SMTP CONNECTION
    this.transporter.verify(
      (error, success) => {
        if (error) {
          console.log(
            "MAIL SERVER ERROR: Connecting to SMTP failed. Falling back to console logging/jsonTransport.",
            error.message || error,
          );
          this.transporter = nodemailer.createTransport({
            jsonTransport: true,
          });
          this.isMock = true;
        } else {
          console.log(
            "MAIL SERVER READY",
          );
        }
      },
    );
  }

  // ===============================
  // VERIFY EMAIL TEMPLATE
  // ===============================

  async sendVerificationEmail(
    email: string,
    token: string,
  ) {
    try {
      const url = `http://localhost:4000/auth/verify?token=${token}`;

      await this.transporter.sendMail({
        from: `"LMS Platform" <${this.configService.get<string>("MAIL_USER")}>`,

        to: email,

        subject:
          "Welcome to LMS - Verify Your Email",

        html: `
        <div
          style="
            font-family: Arial, sans-serif;
            max-width: 600px;
            margin: auto;
            padding: 20px;
            border: 1px solid #e0e0e0;
            border-radius: 10px;
            background-color: #f9f9f9;
          "
        >

          <h2
            style="
              color: #333;
              text-align: center;
            "
          >
            Welcome to Our LMS!
          </h2>

          <p
            style="
              color: #555;
              font-size: 16px;
            "
          >
            Hi there,
          </p>

          <p
            style="
              color: #555;
              font-size: 16px;
            "
          >
            Thanks for signing up!
            Please verify your email
            address by clicking the
            button below.
          </p>

          <div
            style="
              text-align: center;
              margin: 30px 0;
            "
          >
            <a
              href="${url}"

              style="
                background-color: #007bff;
                color: #ffffff;
                padding: 12px 25px;
                text-decoration: none;
                border-radius: 5px;
                font-weight: bold;
                font-size: 16px;
              "
            >
              Verify Email Address
            </a>
          </div>

          <p
            style="
              color: #888;
              font-size: 14px;
              text-align: center;
            "
          >
            If you did not create an
            account, you can safely
            ignore this email.
          </p>

          <hr
            style="
              border: 0;
              border-top: 1px solid #eee;
              margin: 20px 0;
            "
          >

          <p
            style="
              color: #aaa;
              font-size: 12px;
              text-align: center;
            "
          >
            © 2026 LMS Platform.
            All rights reserved.
          </p>

        </div>
        `,
      });

      console.log(
        "Verification email sent",
      );
      if (this.isMock) {
        console.log("---------------- MOCK EMAIL ----------------");
        console.log(`To: ${email}`);
        console.log(`Verification URL: ${url}`);
        console.log("--------------------------------------------");
      }
    } catch (error: any) {
      console.log(
        "Verification Email Error:",
        error.message,
      );
    }
  }

  // ===============================
  // SECURITY ALERT EMAIL
  // ===============================

  async sendSecurityAlertEmail(
    email: string,
    action: string,
  ) {
    try {
      await this.transporter.sendMail({
        from: `"LMS Security" <${this.configService.get<string>("MAIL_USER")}>`,

        to: email,

        subject:
          "Security Alert: Account Activity",

        html: `
        <div
          style="
            font-family: Arial;
            padding: 20px;
            border: 1px solid #ddd;
            border-radius: 8px;
          "
        >

          <h2
            style="
              color: #d9534f;
            "
          >
            Security Notification
          </h2>

          <p>Hello,</p>

          <p>
            Your account password was
            <strong>${action}</strong>.
          </p>

          <p>
            If this was not you,
            please contact our
            support team immediately.
          </p>

          <p
            style="
              color: #777;
            "
          >
            Stay secure,
            <br />
            LMS Team
          </p>

        </div>
        `,
      });

      console.log(
        "Security email sent",
      );
      if (this.isMock) {
        console.log("---------------- MOCK EMAIL ----------------");
        console.log(`To: ${email}`);
        console.log(`Action: Password was ${action}`);
        console.log("--------------------------------------------");
      }
    } catch (error: any) {
      console.log(
        "Security Email Error:",
        error.message,
      );
    }
  }

  // ===============================
  // RESET PASSWORD EMAIL
  // ===============================

  async sendResetPasswordEmail(
    email: string,
    token: string,
  ) {
    try {
      const url = `http://localhost:4000/auth/reset-password?token=${token}`;

      await this.transporter.sendMail({
        from: `"LMS Support" <${this.configService.get<string>("MAIL_USER")}>`,

        to: email,

        subject:
          "Reset Your Password",

        html: `
        <div
          style="
            font-family: Arial;
            max-width: 600px;
            margin: auto;
            padding: 20px;
            border: 1px solid #eee;
            border-radius: 10px;
          "
        >

          <h2
            style="
              text-align: center;
              color: #333;
            "
          >
            Password Reset Request
          </h2>

          <p>
            We received a request to
            reset your password.
            Click the button below
            to proceed.
          </p>

          <div
            style="
              text-align: center;
              margin: 20px 0;
            "
          >
            <a
              href="${url}"

              style="
                background-color: #28a745;
                color: white;
                padding: 10px 20px;
                text-decoration: none;
                border-radius: 5px;
              "
            >
              Reset Password
            </a>
          </div>

          <p
            style="
              font-size: 12px;
              color: #888;
            "
          >
            This link will expire soon.
            If you did not request this,
            ignore this email.
          </p>

        </div>
        `,
      });

      console.log(
        "Reset password email sent",
      );
      if (this.isMock) {
        console.log("---------------- MOCK EMAIL ----------------");
        console.log(`To: ${email}`);
        console.log(`Reset Password URL: ${url}`);
        console.log("--------------------------------------------");
      }
    } catch (error: any) {
      console.log(
        "Reset Password Email Error:",
        error.message,
      );
    }
  }
}