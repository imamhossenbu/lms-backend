import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthUser } from "../../common/auth-user";
import { PrismaService } from "../../prisma/prisma.service";
import { assignmentRuleErrors } from "../assignment-rules";
import { fieldsOf, toAssignmentData } from "../assignment.mapper";
import { DRAFT_COPY_SUFFIX, LIMITS } from "../assignments.constants";
import type { AssignmentFields, AssignmentItem, AssignmentRubric } from "../assignments.types";
import type { CreateAssignmentDto, UpdateAssignmentDto } from "../dto/assignment.dto";
import { AssignmentsQueryService } from "./assignments-query.service";

/** Write side of admin Assignments: create, edit, publish/unpublish, duplicate, delete. */
@Injectable()
export class AssignmentAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly query: AssignmentsQueryService,
  ) {}

  async create(actor: AuthUser, dto: CreateAssignmentDto): Promise<AssignmentItem> {
    const { status = "PUBLISHED", ...fields } = dto;
    const normalized = this.normalize({ ...fields, passingScore: fields.passingScore ?? null });
    await this.assertValid(normalized);
    const row = await this.prisma.assignment.create({
      data: { ...toAssignmentData(normalized), status, institutionId: actor.institutionId ?? null },
    });
    return this.query.item(row);
  }

  async update(actor: AuthUser, id: string, dto: UpdateAssignmentDto): Promise<AssignmentItem> {
    const current = await this.query.item(await this.query.mustFind(actor, id));
    const { status, ...patch } = dto;
    if (patch.courseId && patch.courseId !== current.courseId) throw new BadRequestException("An assignment can't be moved to another course.");
    const merged = this.normalize({ ...fieldsOf(current), ...patch, passingScore: patch.passingScore === undefined ? current.passingScore : patch.passingScore });
    // Legacy rows may point at lessons that were since removed — only re-check links the patch changes.
    await this.assertValid(merged, { module: patch.moduleId !== undefined, lesson: patch.lessonId !== undefined });
    const row = await this.prisma.assignment.update({ where: { id }, data: { ...toAssignmentData(merged), ...(status && { status }) } });
    return this.query.item(row);
  }

  async remove(actor: AuthUser, id: string): Promise<{ id: string }> {
    await this.query.mustFind(actor, id);
    await this.prisma.assignment.delete({ where: { id } }); // submissions cascade
    return { id };
  }

  /** Copy as a DRAFT, without submissions. */
  async duplicate(actor: AuthUser, id: string): Promise<AssignmentItem> {
    const source = await this.query.item(await this.query.mustFind(actor, id));
    const fields = fieldsOf(source);
    const row = await this.prisma.assignment.create({
      data: {
        ...toAssignmentData({ ...fields, title: `${source.title}${DRAFT_COPY_SUFFIX}`.slice(0, LIMITS.titleMax) }),
        status: "DRAFT",
        institutionId: actor.institutionId ?? null,
      },
    });
    return this.query.item(row);
  }

  /** Keep derived fields consistent no matter what the client sent. */
  private normalize(f: Omit<AssignmentFields, "rubric"> & { rubric: Omit<AssignmentRubric, "totalPoints"> }): AssignmentFields {
    return {
      ...f,
      rubric: { ...f.rubric, totalPoints: f.totalPoints },
      showRubric: f.rubric.enabled && f.rubric.criteria.length > 0 ? f.showRubric : false,
    };
  }

  /** Cross-field rules + the course / module / lesson really exist and belong together. */
  private async assertValid(f: AssignmentFields, check = { module: true, lesson: true }) {
    const errors = assignmentRuleErrors(f);
    if (errors.length) throw new BadRequestException(errors);

    const course = await this.prisma.course.findUnique({ where: { id: f.courseId }, select: { id: true } });
    if (!course) throw new NotFoundException("Select a course");
    if (check.module && f.moduleId) {
      const mod = await this.prisma.courseModule.findFirst({ where: { id: f.moduleId, courseId: f.courseId }, select: { id: true } });
      if (!mod) throw new BadRequestException("Select a module from this course");
    }
    if (check.lesson && f.lessonId) {
      const lesson = await this.prisma.lesson.findFirst({ where: { id: f.lessonId, courseId: f.courseId }, select: { id: true } });
      if (!lesson) throw new BadRequestException("The linked lesson isn't part of this course");
    }
  }
}
