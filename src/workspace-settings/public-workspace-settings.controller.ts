import { Controller, Get, NotFoundException, Query } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../prisma/prisma.service";
import { toPublic } from "./workspace-settings.mapper";
import { WorkspaceSettingsReader } from "./services/workspace-settings-reader.service";

/** Unauthenticated branding for login pages and student apps — never includes secrets or admin-only settings. */
@ApiTags("Settings")
@Controller("settings/public")
export class PublicWorkspaceSettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reader: WorkspaceSettingsReader,
  ) {}

  @Get()
  @ApiQuery({ name: "institution", required: false, description: "Institution slug; omit for the legacy workspace" })
  @ApiOperation({ summary: "Platform name, contact, timezone/currency, branding and maintenance banner" })
  async get(@Query("institution") slug?: string) {
    let tenantId: string | null = null;
    if (slug) {
      const inst = await this.prisma.institution.findUnique({ where: { slug: String(slug) }, select: { id: true } });
      if (!inst) throw new NotFoundException("Workspace not found");
      tenantId = inst.id;
    }
    return toPublic(await this.reader.all(tenantId));
  }
}
