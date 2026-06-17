import { Controller, Get, Param, UseGuards, Req } from "@nestjs/common";
import { CertificateService } from "./certificate.service";
import { AuthGuard } from "@nestjs/passport";

@Controller("certificate")
export class CertificateController {
  constructor(private certService: CertificateService) {}

  @Get("my")
  @UseGuards(AuthGuard("jwt"))
  async getMyCerts(@Req() req: any) {
    return await this.certService.getUserCertificates(req.user.userId);
  }

  // Public route: example.com/certificate/verify/XYZ123
  @Get("verify/:code")
  async verify(@Param("code") code: string) {
    return await this.certService.verifyCertificate(code);
  }

  @Get("test-gen/:userId/:courseId")
  async testGen(
    @Param("userId") userId: string,
    @Param("courseId") courseId: string,
  ) {
    return await this.certService.generateCertificate(userId, courseId);
  }
}
