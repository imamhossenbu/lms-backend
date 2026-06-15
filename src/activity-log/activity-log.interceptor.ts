import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { ActivityLogService } from "./activity-log.service";
import { Observable, tap } from "rxjs";

@Injectable()
export class ActivityLogInterceptor implements NestInterceptor {
  constructor(private logService: ActivityLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, params, body } = request;

    return next.handle().pipe(
      tap(async () => {
        const writeMethods = ["POST", "PATCH", "PUT", "DELETE"];

        if (writeMethods.includes(method)) {
          let actionDescription = `${method} request to ${url}`;

          if (url.includes("check-in"))
            actionDescription = "User checked into class";
          if (url.includes("update-duration"))
            actionDescription = `Manual duration update by Admin: ${body.minutes} mins`;
          if (url.includes("remove"))
            actionDescription = "Attendance record deleted";

          await this.logService.logAction(
            request.user?.userId || "SYSTEM",
            actionDescription,
            context.getClass().name,
            params.id || "N/A",
            request,
          );
        }
      }),
    );
  }
}
