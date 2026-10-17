import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { InjectRedis } from './redis.provider';
import { STREAMS } from '@cai/events';
import { MessageReceivedEvent } from '@cai/events';

@Injectable()
export class QueuePublisher implements OnModuleDestroy {
  private readonly logger = new Logger(QueuePublisher.name);

  constructor(@InjectRedis() private readonly redis: Redis) {}

  /**
   * Publish a message.received event to the Redis Stream.
   */
  async publishMessageReceived(
    rawMessageId: string,
    platform: string,
    channelId: string,
    senderId: string,
    rawText: string,
    receivedAt: Date,
  ): Promise<string> {
    const event: MessageReceivedEvent = {
      event_id: uuidv4(),
      event_type: 'message.received',
      produced_by: 'channel-connector-service',
      produced_at: new Date().toISOString(),
      payload: {
        raw_message_id: rawMessageId,
        source_platform: platform,
        source_channel: channelId,
        sender_id: senderId,
        raw_text: rawText,
        received_at: receivedAt.toISOString(),
      },
    };

    const serialized = JSON.stringify(event);
    const streamId = await this.redis.xadd(
      STREAMS.MESSAGE_RECEIVED,
      '*',
      'event',
      serialized,
    );

    this.logger.log(
      `Published message.received event ${event.event_id} → stream entry ${streamId ?? 'null'}`,
    );

    return streamId ?? '';
  }

  /**
   * Return the current length of the cai:message.received stream.
   */
  async getQueueLength(): Promise<number> {
    return this.redis.xlen(STREAMS.MESSAGE_RECEIVED);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
    this.logger.log('Redis connection closed');
  }
}
