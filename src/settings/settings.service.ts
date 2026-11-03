import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/** Legacy defaults (same as the `Setting` model's column defaults) when no row exists. */
const LEGACY_DEFAULTS = {
  id: null,
  siteName: "My LMS",
  logo: null,
  favicon: null,
  defaultLanguage: "bn",
  allowRegistration: true,
  certificateEnabled: true,
  aiEnabled: false,
  maintenanceMode: false,
  primaryColor: "#2563eb",
  secondaryColor: "#64748b",
  accentColor: "#f59e0b",
  backgroundColor: "#ffffff",
  surfaceColor: "#f8fafc",
  textColor: "#1e293b",
  textMutedColor: "#64748b",
  headerBackgroundColor: "#ffffff",
  headerTextColor: "#1e293b",
  footerBackgroundColor: "#1e293b",
  footerTextColor: "#ffffff",
  supportEmail: null,
  contactPhone: null,
  facebookUrl: null,
  youtubeUrl: null,
};

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  /** The single legacy row, or its defaults (no longer created on read). */
  async getSettings() {
    return (await this.prisma.setting.findFirst()) ?? LEGACY_DEFAULTS;
  }
}
