import { ExecutionContext, Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/**
 * JWT is optional: no `Authorization` header → anonymous request (`req.user` undefined).
 * A header that IS sent must be valid (401 otherwise), so an expired admin token never silently
 * falls back to another workspace's public data.
 */
@Injectable()
export class OptionalJwtGuard extends AuthGuard("jwt") {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    if (!req.headers?.authorization) return true;
    return super.canActivate(context);
  }
}
