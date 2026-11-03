import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UsePipes, ValidationPipe } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, RequireRoles, type AuthUser } from "../common/auth-user";
import { VerifyCodeParamDto } from "./certificate.dto";
import { CertificateService } from "./certificate.service";

const CertificateId = () => Param("id", new ParseUUIDPipe({ errorHttpStatusCode: 404 }));

/**
 * Learner side of certificates (own list, detail, download counter) + the public verify page.
 * Admins issue, revoke and design templates at /admin/certificates.
 */
@ApiTags("Certificates (student / public)")
@Controller("certificate")
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class CertificateController {
  constructor(private readonly certService: CertificateService) {}

  @Get("my")
  @RequireRoles("STUDENT", "ADMIN")
  @ApiOperation({ summary: "The signed-in learner's certificates (with template for client-side rendering)" })
  getMyCerts(@CurrentUser() user: AuthUser) {
    return this.certService.getUserCertificates(user.userId);
  }

  @Get("my/:id")
  @RequireRoles("STUDENT", "ADMIN")
  getMine(@CurrentUser() user: AuthUser, @CertificateId() id: string) {
    return this.certService.getMine(user.userId, id);
  }

  @Post("my/:id/download")
  @HttpCode(200)
  @RequireRoles("STUDENT", "ADMIN")
  @ApiOperation({ summary: "Count a learner download" })
  download(@CurrentUser() user: AuthUser, @CertificateId() id: string) {
    return this.certService.recordDownload(user.userId, id);
  }

  /** Public route: example.com/certificate/verify/EDU-HCF-2026-00042 */
  @Get("verify/:code")
  @ApiOperation({ summary: "Public verification by code (no auth)" })
  verify(@Param() params: VerifyCodeParamDto) {
    return this.certService.verifyCertificate(params.code);
  }
}
