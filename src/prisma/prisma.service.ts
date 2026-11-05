import 'dotenv/config';
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { PrismaClient } from "../../generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private pool: Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new InternalServerErrorException(
        "DATABASE_URL is not defined in environment variables!",
      );
    }

    const pool = new Pool({
      connectionString: connectionString,
      max: 10,
      idleTimeoutMillis: 15000, // Discard idle connections after 15s to prevent stale sockets when Neon scales down
      connectionTimeoutMillis: 15000, // Allow up to 15s for Neon to wake up from cold start
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    });

    pool.on("error", (err) => {
      // Prevent unhandled idle connection termination from bubbling as a fatal crash
      this.logger.warn(`PostgreSQL idle client connection dropped: ${err.message}`);
    });

    super({
      adapter: new PrismaPg(pool),
      // Interactive transactions need a fresh pooled connection; after idle sockets are dropped (15s) Neon can take
      // longer than Prisma's 2s default to hand one out (P2028 "Unable to start a transaction in the given time").
      transactionOptions: { maxWait: 10_000, timeout: 15_000 },
      // Lesson editor data (notes, quiz answers…) is staff-only: never returned unless a query opts in with
      // `omit: { editorSettings: false }` (LessonService.findOne for ADMIN / TEACHER).
      // Backup files are only read by the download endpoint (`omit: { data: false }`).
      omit: { lesson: { editorSettings: true }, workspaceBackup: { data: true } },
    });

    this.pool = pool;
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log("✅ Database Connected Successfully using Prisma 7 Adapter!");
    } catch (error) {
      this.logger.error("❌ Database Connection Failed:", error);
      throw error;
    }
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
      await this.pool.end();
      this.logger.log("Database connection pool cleanly closed.");
    } catch (error: any) {
      this.logger.error("Error closing database connection pool:", error?.message);
    }
  }
}

