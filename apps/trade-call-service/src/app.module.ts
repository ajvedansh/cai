import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import configuration, { AppConfig } from './config/configuration';
import { TradeCallsModule } from './trade-calls/trade-calls.module';
import { ReviewQueueModule } from './review-queue/review-queue.module';
import { QueueModule } from './queue/queue.module';

@Module({
  imports: [
    // Global configuration — available everywhere without re-importing
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env', '.env.docker'],
    }),

    // MongoDB connection
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) => ({
        uri: configService.get<string>('mongodbUri'),
        autoIndex: true,
      }),
    }),

    // Rate limiting: 10 requests per 10 seconds
    ThrottlerModule.forRoot([
      {
        ttl: 10_000,
        limit: 10,
      },
    ]),

    TradeCallsModule,
    ReviewQueueModule,
    QueueModule,
  ],
})
export class AppModule {}
