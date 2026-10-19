import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ApiKeyGuard } from './common/guards/api-key.guard';
import { AppConfig } from './config/configuration';
import { TradeCallsService } from './trade-calls/trade-calls.service';
import { QueuePublisher } from './queue/queue.publisher';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // ── CORS ───────────────────────────────────────────────────────────────────
  // Allow the Vercel frontend to make direct SSE connections (bypasses the
  // Vercel Edge Function proxy which has a hard 30-second timeout on Hobby plan).
  // CORS_ORIGINS: comma-separated list of allowed origins for the SSE endpoint.
  // The SSE endpoint is @Public() (read-only), so the browser can connect directly
  // and bypass Vercel Edge Function's 30-second timeout on the Hobby plan.
  const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map(o => o.trim());

  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'OPTIONS'],
    allowedHeaders: ['Accept', 'Cache-Control', 'x-api-key'],
  });

  // ── Security ───────────────────────────────────────────────────────────────
  app.use(helmet({ crossOriginResourcePolicy: false }));

  // ── Global pipes ───────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── Global filters ─────────────────────────────────────────────────────────
  app.useGlobalFilters(new HttpExceptionFilter());

  // ── Global guards ──────────────────────────────────────────────────────────
  const configService = app.get(ConfigService<AppConfig, true>);
  const reflector = app.get(Reflector);
  app.useGlobalGuards(new ApiKeyGuard(configService, reflector));

  // ── Wire QueuePublisher into TradeCallsService (avoids circular DI) ────────
  const tradeCallsService = app.get(TradeCallsService);
  const queuePublisher = app.get(QueuePublisher);
  tradeCallsService.setQueuePublisher(queuePublisher);

  // ── Swagger ────────────────────────────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Trade Call Service')
    .setDescription(
      'Manages trade call lifecycle — ingests parsed signals from Redis Streams, ' +
        'exposes CRUD for TradeCalls and the review queue.',
    )
    .setVersion('1.0.0')
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'x-api-key')
    .addTag('trade-calls', 'Trade call CRUD and lifecycle management')
    .addTag('review-queue', 'Human review queue for low-confidence signals')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  // ── Start ──────────────────────────────────────────────────────────────────
  const port = configService.get<number>('port');
  await app.listen(port);

  const nodeEnv = configService.get<string>('nodeEnv');
  console.log(`[trade-call-service] Listening on port ${port} (${nodeEnv})`);
  console.log(`[trade-call-service] Swagger docs → http://localhost:${port}/api/docs`);
}

bootstrap().catch((err: unknown) => {
  console.error('Failed to start trade-call-service', err);
  process.exit(1);
});
