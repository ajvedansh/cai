import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisProvider } from './redis.provider';
import { QueuePublisher } from './queue.publisher';

@Module({
  imports: [ConfigModule],
  providers: [RedisProvider, QueuePublisher],
  exports: [RedisProvider, QueuePublisher],
})
export class QueueModule {}
