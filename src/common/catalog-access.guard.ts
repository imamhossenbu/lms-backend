import { CanActivate, ExecutionContext, Injectable, NotFoundException, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "../prisma/prisma.service";
import { tenantOf } from "./tenancy";

/** What the `:id` route param of a catalogue controller refers to. */
export type CatalogIdKind = "module" | "lesson" | "resource";
const ID_KIND_KEY = "catalog:id-kind";

/** Declares what `:id` means on this controller, so CatalogAccessGuard can check it belongs to its parent. */
export const CatalogId = (kind: CatalogIdKind) => SetMetadata(ID_KIND_KEY, kind);

/**
 * Tenant + hierarchy check for nested catalogue routes, run after AuthGuard("jwt"):
 *   /courses/:courseId/...                 course must be in the caller's workspace
 *   .../modules/:moduleId/...              module must belong to that course
 *   /lessons/:lessonId/...                 lesson's course must be in the caller's workspace
 *   :id (per @CatalogId)                   module / lesson / resource must belong to the parent in the URL
 * Anything outside the chain is a 404, so ids from other workspaces are indistinguishable from missing ones.
 */
@Injectable()
export class CatalogAccessGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const tenantId = tenantOf(req.user);
    const { courseId, moduleId, lessonId, id } = req.params as Record<string, string | undefined>;
    const kind = this.reflector.getAllAndOverride<CatalogIdKind>(ID_KIND_KEY, [context.getHandler(), context.getClass()]);

    if (courseId) {
      const course = await this.prisma.course.findFirst({ where: { id: courseId, institutionId: tenantId }, select: { id: true } });
      if (!course) throw new NotFoundException("Course not found");
    }
    if (moduleId) {
      const mod = await this.prisma.courseModule.findFirst({ where: { id: moduleId, courseId }, select: { id: true } });
      if (!mod) throw new NotFoundException("Module not found");
    }
    if (lessonId) {
      const lesson = await this.prisma.lesson.findFirst({ where: { id: lessonId, module: { course: { institutionId: tenantId } } }, select: { id: true } });
      if (!lesson) throw new NotFoundException("Lesson not found");
    }

    if (id && kind === "module") {
      const found = await this.prisma.courseModule.findFirst({ where: { id, courseId }, select: { id: true } });
      if (!found) throw new NotFoundException("Module not found");
    } else if (id && kind === "lesson") {
      const found = await this.prisma.lesson.findFirst({ where: { id, moduleId }, select: { id: true } });
      if (!found) throw new NotFoundException("Lesson not found");
    } else if (id && kind === "resource") {
      const found = await this.prisma.lessonResource.findFirst({ where: { id, lessonId }, select: { id: true } });
      if (!found) throw new NotFoundException("Resource not found");
    }
    return true;
  }
}
