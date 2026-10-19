import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable Cross-Origin Resource Sharing for frontend apps
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Swagger / OpenAPI Documentation Setup
  const config = new DocumentBuilder()
    .setTitle('LMS AI Platform API')
    .setDescription(
      'Enterprise-grade Learning Management System & Generative AI Backend API Documentation',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT Access Token',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'LMS AI Platform - API Documentation',
  });

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`🚀 Application is running on port ${port}`);
  console.log(`📑 Swagger Docs available at http://localhost:${port}/api/docs`);
}
bootstrap();