import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { TradeCallDocument } from '../trade-calls/trade-call.schema';
import { TradeCallActivatedEvent } from '@cai/events';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Injectable()
export class QueuePublisher {
  private readonly logger = new Logger(QueuePublisher.name);
  private readonly activatedStream: string;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {
    this.activatedStream = this.configService.get<AppConfig['streams']>('streams').tradeCallActivated;
  }

  /**
   * Publishes a trade_call.activated event to the Redis Stream.
   */
  async publishTradeCallActivated(tradeCall: TradeCallDocument): Promise<void> {
    const event: TradeCallActivatedEvent = {
      event_id: uuidv4(),
      event_type: 'trade_call.activated',
      produced_by: 'trade-call-service',
      produced_at: new Date().toISOString(),
      payload: {
        trade_call_id: (tradeCall._id as { toString(): string }).toString(),
        instrument: tradeCall.instrument,
        segment: tradeCall.segment,
        direction: tradeCall.direction,
        entry_price: tradeCall.entry_price,
        stop_loss: tradeCall.current_sl,
        targets: tradeCall.targets,
        trailing_sl: tradeCall.trailing_sl,
      },
    };

    const messageId = await this.redis.xadd(
      this.activatedStream,
      '*',
      'event',
      JSON.stringify(event),
    );

    this.logger.log(
      `Published trade_call.activated [${messageId}] for trade call ${event.payload.trade_call_id}`,
    );
  }
}
