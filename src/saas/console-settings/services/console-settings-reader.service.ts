import { Injectable } from "@nestjs/common";
import type { Prisma } from "../../../../generated/prisma";
import { PrismaService } from "../../../prisma/prisma.service";
import { CONSOLE_SETTINGS_ROW_ID } from "../console-settings.constants";
import { mergeConsoleSection } from "../console-settings.rules";
import type { ConsoleSettings, ConsoleSettingsSection } from "../console-settings.types";

type Db = Prisma.TransactionClient;

/**
 * Read-only access to one console settings section (defaults when never saved) for the SaaS billing flows:
 *   billing.invoicePrefix / billing.taxRate → SaasCoreService.addInvoice
 *   trials.defaultTrialDays                → self-signup trial length fallback
 */
@Injectable()
export class ConsoleSettingsReader {
  constructor(private readonly prisma: PrismaService) {}

  async section<K extends ConsoleSettingsSection>(section: K, db: Db = this.prisma): Promise<ConsoleSettings[K]> {
    const row = await db.consoleSettings.findUnique({ where: { id: CONSOLE_SETTINGS_ROW_ID } });
    return mergeConsoleSection(section, row?.[section]);
  }
}
