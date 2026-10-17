import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ApiKeyGuard } from './common/guards/api-key.guard';
import { ConfigService } from '@nestjs/config';

async function bootstrap(): Promise<void> {
  // Enable raw body parsing so webhook HMAC verification has access to the
  // unmodified request buffer.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') ?? 3002;

  // Security
  app.use(helmet());

  // CORS — restrict in production
  app.enableCors({
    origin: configService.get<string>('nodeEnv') === 'production' ? false : '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Global validation pipe — strips unknown fields and validates DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global logging interceptor
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Global API key guard (routes decorated with @Public() bypass it)
  const reflector = app.get(Reflector);
  app.useGlobalGuards(new ApiKeyGuard(reflector, configService));

  // Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Channel Connector Service')
    .setDescription(
      'Receives raw messages from WhatsApp and Telegram webhooks, ' +
      'persists them to MongoDB, deduplicates via Redis, and publishes ' +
      'message.received events to a Redis Stream.',
    )
    .setVersion('1.0.0')
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'x-api-key')
    .addTag('webhooks', 'Telegram and WhatsApp webhook endpoints')
    .addTag('raw-messages', 'Query persisted raw messages')
    .addTag('channel-registry', 'Manage registered channels')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(port);
  console.log(`[channel-connector-service] Listening on port ${port}`);
  console.log(`[channel-connector-service] Swagger docs → http://localhost:${port}/api/docs`);
}

bootstrap().catch((err: unknown) => {
  console.error('Failed to start channel-connector-service:', err);
  process.exit(1);
});
