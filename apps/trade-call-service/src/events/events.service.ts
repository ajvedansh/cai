import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Observable, Subject } from 'rxjs';
import { AppConfig } from '../config/configuration';

export const UI_UPDATES_CHANNEL = 'cai:ui.updates';

export interface UiUpdateEvent {
  type: 'trade_call_created' | 'trade_call_updated' | 'trade_call_activated';
  id: string;
  instrument: string;
  status: string;
  ts: number;
}

@Injectable()
export class EventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name);
  private readonly updates$ = new Subject<UiUpdateEvent>();
  private publisher: Redis;
  private subscriber: Redis;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  async onModuleInit(): Promise<void> {
    const url = this.configService.get<string>('redisUrl');

    this.publisher = new Redis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    // Subscriber connection is dedicated — once subscribed it can only do pub/sub
    this.subscriber = new Redis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    this.subscriber.on('message', (_channel: string, message: string) => {
      try {
        const event = JSON.parse(message) as UiUpdateEvent;
        this.updates$.next(event);
      } catch {
        this.logger.warn('events_parse_error', message);
      }
    });

    await this.subscriber.subscribe(UI_UPDATES_CHANNEL);
    this.logger.log(`Subscribed to ${UI_UPDATES_CHANNEL}`);
  }

  async onModuleDestroy(): Promise<void> {
    this.updates$.complete();
    await this.subscriber.unsubscribe(UI_UPDATES_CHANNEL);
    this.subscriber.disconnect();
    this.publisher.disconnect();
  }

  getUpdates$(): Observable<UiUpdateEvent> {
    return this.updates$.asObservable();
  }

  async publish(event: UiUpdateEvent): Promise<void> {
    try {
      const subscribers = await this.publisher.publish(UI_UPDATES_CHANNEL, JSON.stringify(event));
      this.logger.log(`ui_event_published type=${event.type} instrument=${event.instrument} subscribers=${subscribers}`);
    } catch (err) {
      this.logger.error('events_publish_error', String(err));
    }
  }
}
