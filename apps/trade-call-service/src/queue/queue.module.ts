import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { QueueConsumer } from './queue.consumer';
import { QueuePublisher, REDIS_CLIENT } from './queue.publisher';
import { TradeCallsModule } from '../trade-calls/trade-calls.module';
import { ReviewQueueModule } from '../review-queue/review-queue.module';
import { AppConfig } from '../config/configuration';

@Module({
  imports: [TradeCallsModule, ReviewQueueModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService<AppConfig, true>): Redis => {
        const url = configService.get<string>('redisUrl');
        const client = new Redis(url, {
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
          lazyConnect: false,
        });

        client.on('connect', () => {
          const logger = { log: console.log };
          logger.log('[Redis] Connected');
        });

        client.on('error', (err: Error) => {
          console.error('[Redis] Connection error', err.message);
        });

        return client;
      },
      inject: [ConfigService],
    },
    QueuePublisher,
    QueueConsumer,
  ],
  exports: [QueuePublisher, REDIS_CLIENT],
})
export class QueueModule {}
