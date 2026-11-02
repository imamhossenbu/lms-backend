import { applyDecorators, createParamDecorator, ExecutionContext, UseGuards, UsePipes, ValidationPipe } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ApiBearerAuth } from "@nestjs/swagger";
import { Roles } from "../../auth/decorators/roles.decorator";
import { RolesGuard } from "../../auth/guards/roles.guard";

/** Authenticated user as produced by JwtStrategy.validate(). */
export interface AuthUser {
  userId: string;
  email: string;
  role: string;
  institutionId?: string | null;
  impersonatedBy?: string | null;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user);

/** DTO validation for every SaaS endpoint (AGENTS.md §4): transform + strip unknown fields. */
export const SaasValidation = () => UsePipes(new ValidationPipe({ transform: true, whitelist: true }));

/** JWT + role check. */
export const RequireRoles = (...roles: string[]) =>
  applyDecorators(UseGuards(AuthGuard("jwt"), RolesGuard), Roles(...roles), ApiBearerAuth("JWT-auth"));
