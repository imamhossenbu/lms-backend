import { BadRequestException, Injectable } from "@nestjs/common";
import type { Prisma } from "../../../generated/prisma";
import type { AuthUser } from "../../common/auth-user";
import { PrismaService } from "../../prisma/prisma.service";
import { templateRuleErrors } from "../certificate-rules";
import { fieldsOf, toTemplate, toTemplateData } from "../certificate.mapper";
import { CERT_LIMITS, TEMPLATE_COPY_SUFFIX } from "../certificates.constants";
import type { CertificateTemplate, TemplateFields } from "../certificates.types";
import type { CreateTemplateDto, UpdateTemplateDto } from "../dto/template.dto";
import { CertificatesQueryService } from "./certificates-query.service";
import { tenantOf } from "../../common/tenancy";

type Tx = Prisma.TransactionClient;

/** Write side of certificate templates (designer, status actions, duplicate, delete). */
@Injectable()
export class CertificateTemplateAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly query: CertificatesQueryService,
  ) {}

  async create(actor: AuthUser, dto: CreateTemplateDto): Promise<CertificateTemplate> {
    const fields = dto as TemplateFields;
    await this.assertValid(tenantOf(actor), fields);
    const row = await this.prisma.$transaction(async (tx) => {
      const t = await tx.certificateTemplate.create({ data: { ...toTemplateData(fields), institutionId: actor.institutionId ?? null } });
      await this.claimCourses(tx, actor, t.id, fields);
      return t;
    });
    return toTemplate(row);
  }

  async update(actor: AuthUser, id: string, dto: UpdateTemplateDto): Promise<CertificateTemplate> {
    const current = fieldsOf(toTemplate(await this.query.mustFindTemplate(actor, id)));
    const merged: TemplateFields = { ...current, ...(dto as Partial<TemplateFields>) };
    await this.assertValid(tenantOf(actor), merged);
    const row = await this.prisma.$transaction(async (tx) => {
      const t = await tx.certificateTemplate.update({ where: { id }, data: toTemplateData(merged) });
      await this.claimCourses(tx, actor, id, merged);
      return t;
    });
    return toTemplate(row);
  }

  /** Copy as a DRAFT with no courses (the panel's duplicateTemplate). */
  async duplicate(actor: AuthUser, id: string): Promise<CertificateTemplate> {
    const source = toTemplate(await this.query.mustFindTemplate(actor, id));
    return this.create(actor, {
      ...fieldsOf(source),
      name: `${source.name}${TEMPLATE_COPY_SUFFIX}`.slice(0, CERT_LIMITS.nameMax),
      status: "DRAFT",
      courseIds: [],
    } as CreateTemplateDto);
  }

  /** Templates with issued certificates can't be deleted (archive instead). */
  async remove(actor: AuthUser, id: string): Promise<{ id: string }> {
    await this.query.mustFindTemplate(actor, id);
    if (await this.prisma.certificate.count({ where: { templateId: id } }))
      throw new BadRequestException("Certificates were issued with this template. Archive it instead.");
    await this.prisma.certificateTemplate.delete({ where: { id } });
    return { id };
  }

  // ---------------------------------------------------------------- helpers

  /** A course can only be in ONE active template — activating moves it out of the workspace's other active templates. */
  private async claimCourses(tx: Tx, actor: AuthUser, selfId: string, f: TemplateFields) {
    if (f.status !== "ACTIVE" || !f.courseIds.length) return;
    const others = await tx.certificateTemplate.findMany({
      where: { institutionId: actor.institutionId ?? null, status: "ACTIVE", id: { not: selfId }, courseIds: { hasSome: f.courseIds } },
      select: { id: true, courseIds: true },
    });
    for (const o of others) {
      await tx.certificateTemplate.update({ where: { id: o.id }, data: { courseIds: o.courseIds.filter((c) => !f.courseIds.includes(c)) } });
    }
  }

  private async assertValid(tenantId: string | null, f: TemplateFields) {
    const errors = templateRuleErrors(f);
    if (errors.length) throw new BadRequestException(errors);
    const ids = [...new Set(f.courseIds)];
    if (ids.length) {
      const found = await this.prisma.course.count({ where: { id: { in: ids }, institutionId: tenantId } });
      if (found !== ids.length) throw new BadRequestException(["One of the selected courses no longer exists."]);
    }
  }
}
