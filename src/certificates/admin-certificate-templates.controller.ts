import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, RequireRoles, ValidateDto, type AuthUser } from "../common/auth-user";
import { RequirePermission } from "../team/permissions.guard";
import { CreateTemplateDto, UpdateTemplateDto } from "./dto/template.dto";
import { CertificateTemplateAdminService } from "./services/certificate-template-admin.service";
import { CertificatesQueryService } from "./services/certificates-query.service";

const TemplateId = () => Param("id", new ParseUUIDPipe({ errorHttpStatusCode: 404 }));

/** Admin panel › Certificates › Templates tab + designer. Registered before AdminCertificatesController so "templates" never hits `:id`. */
@ApiTags("Admin · Certificates")
@Controller("admin/certificates/templates")
@RequireRoles("ADMIN")
@ValidateDto()
export class AdminCertificateTemplatesController {
  constructor(
    private readonly query: CertificatesQueryService,
    private readonly admin: CertificateTemplateAdminService,
  ) {}

  @Get()
  @RequirePermission("certificates", "view")
  @ApiOperation({ summary: "All templates of the workspace, newest first" })
  list(@CurrentUser() user: AuthUser) {
    return this.query.templates(user);
  }

  @Get(":id")
  @RequirePermission("certificates", "view")
  detail(@CurrentUser() user: AuthUser, @TemplateId() id: string) {
    return this.query.template(user, id);
  }

  @Post()
  @RequirePermission("certificates", "manage")
  @ApiOperation({ summary: "Create from the designer; ACTIVE templates take their courses from other active templates" })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTemplateDto) {
    return this.admin.create(user, dto);
  }

  @Patch(":id")
  @RequirePermission("certificates", "manage")
  @ApiOperation({ summary: "Edit any subset (designer edit, Activate / Archive / Move to draft)" })
  update(@CurrentUser() user: AuthUser, @TemplateId() id: string, @Body() dto: UpdateTemplateDto) {
    return this.admin.update(user, id, dto);
  }

  @Post(":id/duplicate")
  @RequirePermission("certificates", "manage")
  @ApiOperation({ summary: "Copy as a draft with no courses" })
  duplicate(@CurrentUser() user: AuthUser, @TemplateId() id: string) {
    return this.admin.duplicate(user, id);
  }

  @Delete(":id")
  @RequirePermission("certificates", "delete")
  @ApiOperation({ summary: "Delete a template that never issued certificates" })
  remove(@CurrentUser() user: AuthUser, @TemplateId() id: string) {
    return this.admin.remove(user, id);
  }
}
