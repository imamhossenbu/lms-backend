import "dotenv/config";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { buildCorsOptions } from "./common/cors";
import { assertRequiredEnv } from "./common/env";
import { PrismaService } from "./prisma/prisma.service";

async function bootstrap() {
  // Refuse to start without a JWT secret / database (never boot with an empty secret).
  assertRequiredEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const isProd = process.env.NODE_ENV === "production";

  // Behind nginx / a load balancer: use X-Forwarded-For for req.ip (rate limits, login IP, audit log).
  // Only enable when a proxy really sits in front, otherwise clients could spoof their IP.
  if (process.env.TRUST_PROXY) {
    const hops = Number(process.env.TRUST_PROXY);
    app.set("trust proxy", Number.isNaN(hops) ? process.env.TRUST_PROXY : hops);
  }

  // Security headers. CSP is off: this is a JSON API (and Swagger UI needs inline scripts).
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));

  app.enableCors(buildCorsOptions(app.get(PrismaService)));

  // Validate every DTO-typed body / query: transform to the DTO class and strip unknown fields.
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: false }));
  app.enableShutdownHooks();

  // API docs: on in development, opt-in in production (SWAGGER_ENABLED=true).
  const swaggerEnabled = process.env.SWAGGER_ENABLED ? process.env.SWAGGER_ENABLED === "true" : !isProd;
  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle("LMS AI Platform API")
      .setDescription("Enterprise-grade Learning Management System & Generative AI Backend API Documentation")
      .setVersion("1.0.0")
      .addBearerAuth({ type: "http", scheme: "bearer", bearerFormat: "JWT", name: "JWT", description: "Enter JWT Access Token", in: "header" }, "JWT-auth")
      .build();
    SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, config), { customSiteTitle: "LMS AI Platform - API Documentation" });
  }

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`🚀 Application is running on port ${port}`);
  if (swaggerEnabled) console.log(`📑 Swagger Docs available at http://localhost:${port}/api/docs`);
}
bootstrap();
