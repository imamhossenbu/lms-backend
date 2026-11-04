import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { jwtSecret } from "../common/env";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret(),
    });
  }

  async validate(payload: any) {
    // Purpose-bound tokens (2FA challenge, password reset) are not access tokens.
    if (payload?.purpose) throw new UnauthorizedException("Invalid access token");
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
