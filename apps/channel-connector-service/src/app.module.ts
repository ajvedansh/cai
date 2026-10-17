import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { RawMessagesModule } from './raw-messages/raw-messages.module';
import { ChannelRegistryModule } from './channel-registry/channel-registry.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { QueueModule } from './queue/queue.module';

@Module({
  imports: [
    // Config — global so all modules can inject ConfigService
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env.docker', '.env'],
    }),

    // MongoDB via Mongoose
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('mongodb.uri'),
        dbName: 'channel_db',
      }),
    }),

    // Rate limiting
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            ttl: configService.get<number>('rateLimit.ttl') ?? 60000,
            limit: configService.get<number>('rateLimit.max') ?? 100,
          },
        ],
      }),
    }),

    // Feature modules
    QueueModule,
    RawMessagesModule,
    ChannelRegistryModule,
    WebhooksModule,
  ],
})
export class AppModule {}
