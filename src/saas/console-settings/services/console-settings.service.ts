import { BadGatewayException, BadRequestException, Injectable } from "@nestjs/common";
import type { Prisma } from "../../../../generated/prisma";
import { MailService } from "../../../auth/mail/mail.service";
import { encryptSecret } from "../../../common/crypto";
import { PrismaService } from "../../../prisma/prisma.service";
import { CONSOLE_SETTINGS_ROW_ID } from "../console-settings.constants";
import { consoleSettingsErrors, extractConsoleSecrets, storedConsoleSecrets, toConsoleSettingsStore } from "../console-settings.rules";
import type { ConsoleSettings, ConsoleSettingsSection, ConsoleSettingsStore } from "../console-settings.types";

type Tx = Prisma.TransactionClient;
type Row = Prisma.ConsoleSettingsGetPayload<object>;
const json = (v: unknown) => v as Prisma.InputJsonValue;

/** Owner Console › Settings: one platform row, GET with defaults, save a section, test email. */
@Injectable()
export class ConsoleSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async store(): Promise<ConsoleSettingsStore> {
    return toConsoleSettingsStore(await this.prisma.consoleSettings.findUnique({ where: { id: CONSOLE_SETTINGS_ROW_ID } }));
  }

  /** Validates cross-field rules, encrypts gateway secrets ("" keeps the saved one) and returns the fresh store. */
  async save<K extends ConsoleSettingsSection>(section: K, values: ConsoleSettings[K], ownerId: string): Promise<ConsoleSettingsStore> {
    const errors = consoleSettingsErrors(section, values);
    if (errors.length) throw new BadRequestException(errors);
    const row = await this.locked(async (tx, cur) => {
      const { clean, secrets } = extractConsoleSecrets(section, values, storedConsoleSecrets(cur.secrets), encryptSecret);
      return tx.consoleSettings.update({
        where: { id: cur.id },
        data: {
          [section]: json(clean),
          secrets: json(secrets),
          sectionUpdatedAt: json({ ...(cur.sectionUpdatedAt as object), [section]: new Date().toISOString() }),
          updatedById: ownerId,
        },
      });
    });
    return toConsoleSettingsStore(row);
  }

  /** Settings › Emails › Send test email (platform mailer, console sender name in the subject). */
  async sendTestEmail(to: string, ownerName: string): Promise<{ to: string }> {
    const { settings } = await this.store();
    try {
      await this.mail.sendAdminMessageEmail(
        to,
        to,
        settings.email.senderName || ownerName,
        `Test email from ${settings.email.senderName}`,
        `This is a test email from ${settings.company.legalName}. If you're reading this, lifecycle emails to institutions can be delivered.`,
      );
    } catch {
      throw new BadGatewayException("We couldn't send the test email. Check the mail configuration and try again.");
    }
    return { to };
  }

  /** Runs `fn` with the platform row created (if needed) and locked, so concurrent saves don't lose secrets. */
  private locked<T>(fn: (tx: Tx, cur: Row) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.consoleSettings.createMany({ data: [{ id: CONSOLE_SETTINGS_ROW_ID }], skipDuplicates: true });
      await tx.$executeRaw`SELECT 1 FROM "console_settings" WHERE "id" = ${CONSOLE_SETTINGS_ROW_ID} FOR UPDATE`;
      return fn(tx, await tx.consoleSettings.findUniqueOrThrow({ where: { id: CONSOLE_SETTINGS_ROW_ID } }));
    });
  }
}
