import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TradeCall, TradeCallDocument } from './trade-call.schema';
import { CreateTradeCallDto } from './dto/create-trade-call.dto';
import { QueryTradeCallsDto } from './dto/query-trade-calls.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { StateMachineService } from './state-machine.service';
import { TradeCallStatus } from '@cai/types';

@Injectable()
export class TradeCallsService {
  private readonly logger = new Logger(TradeCallsService.name);

  // Injected lazily to avoid circular dependency (QueueModule imports TradeCallsModule)
  private queuePublisher: { publishTradeCallActivated(tc: TradeCallDocument): Promise<void> } | null = null;

  constructor(
    @InjectModel(TradeCall.name)
    private readonly tradeCallModel: Model<TradeCallDocument>,
    private readonly stateMachine: StateMachineService,
  ) {}

  setQueuePublisher(publisher: { publishTradeCallActivated(tc: TradeCallDocument): Promise<void> }): void {
    this.queuePublisher = publisher;
  }

  /**
   * Creates a trade call from a parsed trade_call.created event payload.
   *
   * De-duplication rule: if an ACTIVE or PENDING trade call for the same
   * instrument + channel already exists within the last 24 hours, update
   * that document instead of inserting a new one.
   *
   * Confidence >= 0.85 → status ACTIVE; otherwise PENDING.
   */
  async createFromEvent(dto: CreateTradeCallDto): Promise<TradeCallDocument> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const existing = await this.tradeCallModel
      .findOne({
        instrument: dto.instrument.toUpperCase(),
        channel_id: dto.source_channel,
        status: { $in: [TradeCallStatus.ACTIVE, TradeCallStatus.PENDING] },
        createdAt: { $gte: since },
      })
      .exec();

    const targetCount = dto.targets.length;
    const targetsHit = Array.from<boolean>({ length: targetCount }).fill(false);
    const initialStatus: TradeCallStatus =
      dto.confidence >= 0.85 ? TradeCallStatus.ACTIVE : TradeCallStatus.PENDING;

    if (existing) {
      this.logger.log(
        `Updating existing trade call ${existing._id} for ${dto.instrument} on channel ${dto.source_channel}`,
      );

      // Snapshot current values before overwriting
      const snapshot: Record<string, unknown> = {
        raw_message_id: existing.raw_message_id,
        entry_price: existing.entry_price,
        initial_sl: existing.initial_sl,
        current_sl: existing.current_sl,
        targets: existing.targets,
        target_split: existing.target_split,
        trailing_sl: existing.trailing_sl,
        risk_pct: existing.risk_pct,
        confidence: existing.confidence,
        model_version: existing.model_version,
        direction: existing.direction,
        segment: existing.segment,
        status: existing.status,
        updated_at: new Date().toISOString(),
      };
      existing.update_history = [...(existing.update_history ?? []), snapshot];

      existing.raw_message_id = dto.raw_message_id;
      existing.entry_price = dto.entry_price;
      existing.initial_sl = dto.stop_loss;
      existing.current_sl = dto.stop_loss;
      existing.targets = dto.targets;
      existing.target_split = dto.target_split;
      existing.targets_hit = targetsHit;
      existing.trailing_sl = dto.trailing_sl ?? true;
      existing.risk_pct = dto.risk_pct ?? null;
      existing.confidence = dto.confidence;
      existing.model_version = dto.model_version;
      existing.direction = dto.direction;
      existing.segment = dto.segment;
      existing.parsed_data = dto.parsed_data ?? null;

      if (
        existing.status === TradeCallStatus.PENDING &&
        initialStatus === TradeCallStatus.ACTIVE
      ) {
        existing.status = TradeCallStatus.ACTIVE;
        existing.activated_at = new Date();
      }

      return existing.save();
    }

    const activatedAt =
      initialStatus === TradeCallStatus.ACTIVE ? new Date() : null;

    const created = await this.tradeCallModel.create({
      raw_message_id: dto.raw_message_id,
      channel_id: dto.source_channel,
      instrument: dto.instrument.toUpperCase(),
      segment: dto.segment,
      direction: dto.direction,
      entry_price: dto.entry_price,
      initial_sl: dto.stop_loss,
      current_sl: dto.stop_loss,
      targets: dto.targets,
      target_split: dto.target_split,
      targets_hit: targetsHit,
      trailing_sl: dto.trailing_sl ?? true,
      risk_pct: dto.risk_pct ?? null,
      confidence: dto.confidence,
      model_version: dto.model_version,
      status: initialStatus,
      activated_at: activatedAt,
      parsed_data: dto.parsed_data ?? null,
    });

    this.logger.log(
      `Created trade call ${created._id} (${created.status}) for ${created.instrument}`,
    );

    return created;
  }

  /**
   * Paginated list with optional filters.
   */
  async findAll(query: QueryTradeCallsDto): Promise<{
    data: TradeCallDocument[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (query.status) filter['status'] = query.status;
    if (query.segment) filter['segment'] = query.segment;
    if (query.channel_id) filter['channel_id'] = query.channel_id;
    if (query.instrument)
      filter['instrument'] = query.instrument.toUpperCase();

    const [data, total] = await Promise.all([
      this.tradeCallModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.tradeCallModel.countDocuments(filter).exec(),
    ]);

    return { data, total, page, limit };
  }

  /**
   * Find a single trade call by its Mongoose _id.
   */
  async findById(id: string): Promise<TradeCallDocument> {
    const doc = await this.tradeCallModel.findById(id).exec();
    if (!doc) {
      throw new NotFoundException(`TradeCall ${id} not found`);
    }
    return doc;
  }

  /**
   * Update status via the state machine.
   */
  async updateStatus(
    id: string,
    dto: UpdateStatusDto,
  ): Promise<TradeCallDocument> {
    const doc = await this.findById(id);

    if (!this.stateMachine.canTransition(doc.status, dto.status)) {
      throw new BadRequestException(
        `Cannot transition from ${doc.status} to ${dto.status}. ` +
          `Allowed transitions: ${this.stateMachine.getAllowedTransitions(doc.status).join(', ')}`,
      );
    }

    doc.status = dto.status;
    if (dto.review_note !== undefined) {
      doc.review_note = dto.review_note;
    }

    const closedStatuses = new Set<TradeCallStatus>([
      TradeCallStatus.COMPLETED_ALL_TARGETS,
      TradeCallStatus.CLOSED_SL,
      TradeCallStatus.CLOSED_SL_BREAKEVEN,
      TradeCallStatus.CLOSED_SL_AFTER_TP,
      TradeCallStatus.EXPIRED,
      TradeCallStatus.MANUALLY_CLOSED,
    ]);

    if (closedStatuses.has(dto.status)) {
      doc.closed_at = new Date();
    }

    if (dto.status === TradeCallStatus.ACTIVE && !doc.activated_at) {
      doc.activated_at = new Date();
    }

    return doc.save();
  }

  /**
   * Admin action: promote a PENDING trade call to ACTIVE and publish the
   * trade_call.activated event.
   */
  async activate(id: string): Promise<TradeCallDocument> {
    const doc = await this.findById(id);

    if (!this.stateMachine.canTransition(doc.status, TradeCallStatus.ACTIVE)) {
      throw new BadRequestException(
        `Cannot activate trade call in status ${doc.status}`,
      );
    }

    doc.status = TradeCallStatus.ACTIVE;
    doc.activated_at = new Date();

    const saved = await doc.save();

    await this.publishActivatedEvent(saved);

    return saved;
  }

  /**
   * Publishes a trade_call.activated event via QueuePublisher.
   */
  async publishActivatedEvent(tradeCall: TradeCallDocument): Promise<void> {
    if (!this.queuePublisher) {
      this.logger.warn(
        'QueuePublisher not set — skipping trade_call.activated event',
      );
      return;
    }
    try {
      await this.queuePublisher.publishTradeCallActivated(tradeCall);
      this.logger.log(
        `Published trade_call.activated for trade call ${tradeCall._id}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to publish trade_call.activated for ${tradeCall._id}`,
        err,
      );
    }
  }

  /**
   * Returns aggregated stats: count by status, count by segment.
   */
  async getStats(): Promise<{
    byStatus: Record<string, number>;
    bySegment: Record<string, number>;
    total: number;
  }> {
    const [statusAgg, segmentAgg, total] = await Promise.all([
      this.tradeCallModel
        .aggregate<{ _id: string; count: number }>([
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ])
        .exec(),
      this.tradeCallModel
        .aggregate<{ _id: string; count: number }>([
          { $group: { _id: '$segment', count: { $sum: 1 } } },
        ])
        .exec(),
      this.tradeCallModel.countDocuments().exec(),
    ]);

    const byStatus: Record<string, number> = {};
    for (const row of statusAgg) {
      byStatus[row._id] = row.count;
    }

    const bySegment: Record<string, number> = {};
    for (const row of segmentAgg) {
      bySegment[row._id] = row.count;
    }

    return { byStatus, bySegment, total };
  }
}
