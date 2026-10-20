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

