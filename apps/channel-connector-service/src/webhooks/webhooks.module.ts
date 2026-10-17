import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WebhooksController } from './webhooks.controller';
import { RawMessagesModule } from '../raw-messages/raw-messages.module';
import { ChannelRegistryModule } from '../channel-registry/channel-registry.module';
import { QueueModule } from '../queue/queue.module';
import { TelegramAdapter } from '../adapters/telegram/telegram.adapter';
import { WhatsAppAdapter } from '../adapters/whatsapp/whatsapp.adapter';

@Module({
  imports: [
    ConfigModule,
    RawMessagesModule,
    ChannelRegistryModule,
    QueueModule,
  ],
  controllers: [WebhooksController],
  providers: [TelegramAdapter, WhatsAppAdapter],
})
export class WebhooksModule {}
