import { Provider, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

export const RedisProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (configService: ConfigService): Redis => {
    const url = configService.get<string>('redis.url') ?? 'redis://localhost:6379';
    const client = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
      enableReadyCheck: true,
    });

    client.on('connect', () => {
      // eslint-disable-next-line no-console
      console.log('[Redis] Connected');
    });

    client.on('error', (err: Error) => {
      // eslint-disable-next-line no-console
      console.error('[Redis] Connection error:', err.message);
    });

    return client;
  },
};

export const InjectRedis = () => Inject(REDIS_CLIENT);
