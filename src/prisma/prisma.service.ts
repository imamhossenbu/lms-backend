import 'dotenv/config';
import {
  Injectable,
  OnModuleInit,
  InternalServerErrorException,
} from "@nestjs/common";
import { PrismaClient } from "../../generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new InternalServerErrorException(
        "DATABASE_URL is not defined in environment variables!",
      );
    }

    const pool = new Pool({
      connectionString: connectionString,
    });

    super({
      adapter: new PrismaPg(pool),
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      console.log("✅ Database Connected Successfully using Prisma 7 Adapter!");
    } catch (error) {
      console.error("❌ Database Connection Failed:", error);
      throw error;
    }
  }
}
