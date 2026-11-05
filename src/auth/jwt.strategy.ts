import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { jwtSecret } from "../common/env";
import { SecurityPolicyService } from "../workspace-settings/security-policy.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly securityPolicy: SecurityPolicyService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret(),
    });
  }

  async validate(payload: any) {
    // Purpose-bound tokens (2FA challenge, password reset) are not access tokens.
    if (payload?.purpose) throw new UnauthorizedException("Invalid access token");
    // Settings › Security › Session timeout: admins are signed out after being idle too long (impersonation
    // tokens from the Owner Console are exempt).
    if (payload.role === "ADMIN" && !payload.impersonatedBy && payload.sub) {
      const active = await this.securityPolicy.touchAdminSession(payload.sub, payload.institutionId ?? null);
      if (!active) throw new UnauthorizedException("You were signed out after a period of inactivity. Please sign in again.");
    }
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      // SaaS tenant claims (set for institution users and owner impersonation tokens)
      institutionId: payload.institutionId ?? null,
      impersonatedBy: payload.impersonatedBy ?? null,
    };
  }
}
