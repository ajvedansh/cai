import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { TradeCallsService } from '../trade-calls/trade-calls.service';
import { ReviewQueueService } from '../review-queue/review-queue.service';
import { AppConfig } from '../config/configuration';
import { TradeCallCreatedEvent, MessageNeedsReviewEvent } from '@cai/events';
import { TradeCallStatus } from '@cai/types';
import { REDIS_CLIENT } from './queue.publisher';

const BLOCK_MS = 10000; // block xreadgroup for up to 10 s — reduces Redis reads 2× without adding latency

@Injectable()
export class QueueConsumer
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(QueueConsumer.name);

  private readonly consumerGroup: string;
  private readonly consumerName: string;
  private readonly tradeCallStream: string;
  private readonly needsReviewStream: string;

  private running = false;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly tradeCallsService: TradeCallsService,
    private readonly reviewQueueService: ReviewQueueService,
  ) {
    const streams = this.configService.get<AppConfig['streams']>('streams');
    this.consumerGroup = this.configService.get<string>('consumerGroup');
    this.consumerName = this.configService.get<string>('consumerName');
    this.tradeCallStream = streams.tradeCallCreated;
    this.needsReviewStream = streams.needsReview;
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureConsumerGroups();
    this.running = true;
    // Start both consumers in parallel without awaiting (they loop until shutdown)
    void this.startTradeCallConsumer();
    void this.startNeedsReviewConsumer();
    this.logger.log('Queue consumers started');
  }

  onApplicationShutdown(_signal?: string): void {
    this.running = false;
    this.logger.log('Queue consumers shutting down');
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async ensureConsumerGroups(): Promise<void> {
    for (const stream of [this.tradeCallStream, this.needsReviewStream]) {
      try {
        await this.redis.xgroup('CREATE', stream, this.consumerGroup, '$', 'MKSTREAM');
        this.logger.log(`Consumer group "${this.consumerGroup}" created on stream "${stream}"`);
      } catch (err: unknown) {
        if (
          err instanceof Error &&
          err.message.includes('BUSYGROUP')
        ) {
          this.logger.log(
            `Consumer group "${this.consumerGroup}" already exists on stream "${stream}"`,
          );
        } else {
          throw err;
        }
      }
    }
  }

  /**
   * Drain any PEL messages assigned to this consumer that survived a prior crash.
   * Reads with id '0' returns all pending (un-ACKed) messages for this consumer.
   */
  private async reclaimPending(stream: string, processFn: (id: string, fields: string[]) => Promise<void>): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = await (this.redis as any).xreadgroup(
      'GROUP', this.consumerGroup, this.consumerName,
      'COUNT', 100, 'STREAMS', stream, '0',
    );
    if (!results || results.length === 0) return;
    for (const [, messages] of results as [string, [string, string[]][]][]) {
      for (const [msgId, fields] of messages) {
        this.logger.log(`[Reclaim] Re-processing pending msg ${msgId} from PEL`);
        await processFn(msgId, fields);
      }
    }
  }

  /**
   * Infinite loop that reads from cai:trade_call.created and creates TradeCall documents.
   */
  private async startTradeCallConsumer(): Promise<void> {
    this.logger.log(
      `[TradeCallConsumer] Listening on stream: ${this.tradeCallStream}`,
    );

    // Re-process any messages that were delivered but not ACKed before last restart
    await this.reclaimPending(this.tradeCallStream, (id, fields) =>
      this.processTradeCallMessage(id, fields),
    );

    while (this.running) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const results = await (this.redis as any).xreadgroup(
          'GROUP',
          this.consumerGroup,
          this.consumerName,
          'COUNT',
          10,
          'BLOCK',
          BLOCK_MS,
          'STREAMS',
          this.tradeCallStream,
          '>',
        );

        if (!results || results.length === 0) continue;

        for (const [, messages] of results as [string, [string, string[]][]][]) {
          for (const [msgId, fields] of messages) {
            await this.processTradeCallMessage(msgId, fields);
          }
        }
      } catch (err) {
        if (this.running) {
          this.logger.error('[TradeCallConsumer] Error reading stream', err);
          await this.sleep(2000);
        }
      }
    }
  }

  /**
   * Infinite loop that reads from cai:message.needs_review and creates ReviewItem documents.
   */
  private async startNeedsReviewConsumer(): Promise<void> {
    this.logger.log(
      `[NeedsReviewConsumer] Listening on stream: ${this.needsReviewStream}`,
    );

    await this.reclaimPending(this.needsReviewStream, (id, fields) =>
      this.processNeedsReviewMessage(id, fields),
    );

    while (this.running) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const results = await (this.redis as any).xreadgroup(
          'GROUP',
          this.consumerGroup,
          this.consumerName,
          'COUNT',
          10,
          'BLOCK',
          BLOCK_MS,
          'STREAMS',
          this.needsReviewStream,
          '>',
        );

        if (!results || results.length === 0) continue;

        for (const [, messages] of results as [string, [string, string[]][]][]) {
          for (const [msgId, fields] of messages) {
            await this.processNeedsReviewMessage(msgId, fields);
          }
        }
      } catch (err) {
        if (this.running) {
          this.logger.error('[NeedsReviewConsumer] Error reading stream', err);
          await this.sleep(2000);
        }
      }
    }
  }

  private async processTradeCallMessage(
    msgId: string,
    fields: string[],
  ): Promise<void> {
    try {
      const raw = this.parseFields(fields);
      const event = JSON.parse(raw['event']) as TradeCallCreatedEvent;
      const payload = event.payload;

      this.logger.log(
        `[TradeCallConsumer] Processing msg ${msgId} — instrument: ${payload.instrument}`,
      );

      const createDto = {
        raw_message_id: payload.raw_message_id,
        source_channel: payload.source_channel,
        instrument: payload.instrument,
        segment: payload.segment,
        direction: payload.direction,
        entry_price: payload.entry_price,
        stop_loss: payload.stop_loss,
        targets: payload.targets,
        target_split: payload.target_split,
        trailing_sl: payload.trailing_sl,
        risk_pct: payload.risk_pct,
        confidence: payload.confidence,
        model_version: payload.model_version,
        parsed_data: payload.parsed_data,
      };

      const tradeCall = await this.tradeCallsService.createFromEvent(createDto);

      if (tradeCall.status === TradeCallStatus.ACTIVE) {
        await this.tradeCallsService.publishActivatedEvent(tradeCall);
      }

      await this.ack(this.tradeCallStream, msgId);
    } catch (err) {
      this.logger.error(
        `[TradeCallConsumer] Failed to process msg ${msgId}`,
        err,
      );
      // Do not ACK — message stays in PEL for retry / dead-letter handling
    }
  }

  private async processNeedsReviewMessage(
    msgId: string,
    fields: string[],
  ): Promise<void> {
    try {
      const raw = this.parseFields(fields);
      const event = JSON.parse(raw['event']) as MessageNeedsReviewEvent;
      const payload = event.payload;

      this.logger.log(
        `[NeedsReviewConsumer] Processing msg ${msgId} — reason: ${payload.reason}`,
      );

      await this.reviewQueueService.createFromEvent(payload);

      await this.ack(this.needsReviewStream, msgId);
    } catch (err) {
      this.logger.error(
        `[NeedsReviewConsumer] Failed to process msg ${msgId}`,
        err,
      );
    }
  }

  /** Converts the flat key-value array Redis returns into a plain object. */
  private parseFields(fields: string[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      result[fields[i]] = fields[i + 1];
    }
    return result;
  }

  private async ack(stream: string, msgId: string): Promise<void> {
    await this.redis.xack(stream, this.consumerGroup, msgId);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
