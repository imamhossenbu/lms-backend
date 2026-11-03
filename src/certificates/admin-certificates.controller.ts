import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, RequireRoles, ValidateDto, type AuthUser } from "../common/auth-user";
import { RequirePermission } from "../team/permissions.guard";
import {
  ActivityQueryDto,
  BulkIdsDto,
  BulkRevokeDto,
  CourseFilterDto,
  IssueCertificateDto,
  IssuedFilterDto,
  IssueEligibleDto,
  LearnerQueryDto,
  RevokeCertificateDto,
  VerifyCodeDto,
} from "./dto/certificate.dto";
import { CertificateAdminService } from "./services/certificate-admin.service";
import { CertificatesQueryService } from "./services/certificates-query.service";

const CertificateId = () => Param("id", new ParseUUIDPipe({ errorHttpStatusCode: 404 }));

/** Admin panel › Certificates: Issued / Eligible tabs, stats, issue, revoke / restore, email, downloads, verify. */
@ApiTags("Admin · Certificates")
@Controller("admin/certificates")
@RequireRoles("ADMIN")
@ValidateDto()
export class AdminCertificatesController {
  constructor(
    private readonly query: CertificatesQueryService,
    private readonly admin: CertificateAdminService,
  ) {}

  @Get()
  @RequirePermission("certificates", "view")
  @ApiOperation({ summary: "Paginated issued certificates with search / course / template / status / method / issued-date filters" })
  list(@CurrentUser() user: AuthUser, @Query() q: IssuedFilterDto) {
    return this.query.list(user, q);
  }

  @Get("export")
  @RequirePermission("certificates", "view")
  @ApiOperation({ summary: "Every certificate matching the filters (for the CSV export; page/limit ignored)" })
  export(@CurrentUser() user: AuthUser, @Query() q: IssuedFilterDto) {
    return this.query.export(user, q);
  }

  @Get("stats")
  @RequirePermission("certificates", "view")
  @ApiOperation({ summary: "Stat cards, insight strip, monthly chart, by-course card, template usage and tab counts" })
  stats(@CurrentUser() user: AuthUser) {
    return this.query.overview(user);
  }

  @Get("activity")
  @RequirePermission("certificates", "view")
  @ApiOperation({ summary: "Latest certificate events (Recent Activity card)" })
  activity(@CurrentUser() user: AuthUser, @Query() q: ActivityQueryDto) {
    return this.query.activity(user, q);
  }

  @Get("eligible")
  @RequirePermission("certificates", "view")
  @ApiOperation({ summary: "Learners who meet a manual template's rules and have no valid certificate" })
  eligible(@CurrentUser() user: AuthUser, @Query() q: CourseFilterDto) {
    return this.query.eligible(user, q.courseId);
  }

  @Get("learners")
  @RequirePermission("certificates", "view")
  @ApiOperation({ summary: "Learner picker for the issue modal (enrolled in the course when courseId is given)" })
  learners(@CurrentUser() user: AuthUser, @Query() q: LearnerQueryDto) {
    return this.query.learners(user, q);
  }

  @Post("verify")
  @HttpCode(200)
  @RequirePermission("certificates", "view")
  @ApiOperation({ summary: "Verify modal: find a code in this workspace and count the verification" })
  verify(@CurrentUser() user: AuthUser, @Body() dto: VerifyCodeDto) {
    return this.admin.verify(user, dto.code);
  }

  @Post("issue")
  @RequirePermission("certificates", "manage")
  @ApiOperation({ summary: "Issue a certificate manually (course needs an ACTIVE template)" })
  issue(@CurrentUser() user: AuthUser, @Body() dto: IssueCertificateDto) {
    return this.admin.issue(user, dto);
  }

  @Post("issue-eligible")
  @HttpCode(200)
  @RequirePermission("certificates", "manage")
  @ApiOperation({ summary: "Issue to everyone in a course's eligible queue" })
  issueEligible(@CurrentUser() user: AuthUser, @Body() dto: IssueEligibleDto) {
    return this.admin.issueEligible(user, dto);
  }

  @Post("bulk/revoke")
  @HttpCode(200)
  @RequirePermission("certificates", "manage")
  bulkRevoke(@CurrentUser() user: AuthUser, @Body() dto: BulkRevokeDto) {
    return this.admin.bulkRevoke(user, dto);
  }

  @Post("bulk/email")
  @HttpCode(200)
  @RequirePermission("certificates", "manage")
  bulkEmail(@CurrentUser() user: AuthUser, @Body() dto: BulkIdsDto) {
    return this.admin.bulkEmail(user, dto);
  }

  @Get(":id")
  @RequirePermission("certificates", "view")
  @ApiOperation({ summary: "Certificate + its template + activity" })
  detail(@CurrentUser() user: AuthUser, @CertificateId() id: string) {
    return this.query.detail(user, id);
  }

  @Post(":id/revoke")
  @HttpCode(200)
  @RequirePermission("certificates", "manage")
  revoke(@CurrentUser() user: AuthUser, @CertificateId() id: string, @Body() dto: RevokeCertificateDto) {
    return this.admin.revoke(user, id, dto);
  }

  @Post(":id/restore")
  @HttpCode(200)
  @RequirePermission("certificates", "manage")
  restore(@CurrentUser() user: AuthUser, @CertificateId() id: string) {
    return this.admin.restore(user, id);
  }

  @Post(":id/email")
  @HttpCode(200)
  @RequirePermission("certificates", "manage")
  @ApiOperation({ summary: "Re-send the certificate email" })
  email(@CurrentUser() user: AuthUser, @CertificateId() id: string) {
    return this.admin.email(user, id);
  }

  @Post(":id/downloads")
  @HttpCode(200)
  @RequirePermission("certificates", "view")
  @ApiOperation({ summary: "Count a download (the panel renders the PDF client-side)" })
  download(@CurrentUser() user: AuthUser, @CertificateId() id: string) {
    return this.admin.recordDownload(user, id);
  }
}
