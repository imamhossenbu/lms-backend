import { applyDecorators, createParamDecorator, ExecutionContext, UseGuards, UsePipes, ValidationPipe } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ApiBearerAuth } from "@nestjs/swagger";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";

/** Authenticated user as produced by JwtStrategy.validate(). */
export interface AuthUser {
  userId: string;
  email: string;
  role: string;
  /** SaaS tenant. null = legacy single-tenant data (users created before the SaaS layer). */
  institutionId?: string | null;
  /** Set on owner impersonation tokens. */
  impersonatedBy?: string | null;
}

/** Injects the authenticated user: `@CurrentUser() user: AuthUser`. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user);

/** JWT authentication + role check (class or method level). */
export const RequireRoles = (...roles: string[]) =>
  applyDecorators(UseGuards(AuthGuard("jwt"), RolesGuard), Roles(...roles), ApiBearerAuth("JWT-auth"));

/** DTO validation: transform payloads to DTO classes and strip unknown fields. */
export const ValidateDto = () => UsePipes(new ValidationPipe({ transform: true, whitelist: true }));

/** Tenant filter for models that carry `institutionId` (User today; more models as tenancy rolls out). */
export const tenantWhere = (user: Pick<AuthUser, "institutionId">) => ({ institutionId: user.institutionId ?? null });
