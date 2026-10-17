import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ReviewItem, ReviewItemDocument } from './review-item.schema';
import { PromoteReviewDto } from './dto/promote-review.dto';
import { TradeCallsService } from '../trade-calls/trade-calls.service';
import { TradeCallDocument } from '../trade-calls/trade-call.schema';
import { MessageNeedsReviewEvent } from '@cai/events';
import { ReviewStatus } from '@cai/types';

type MessageNeedsReviewPayload = MessageNeedsReviewEvent['payload'];

@Injectable()
export class ReviewQueueService {
  private readonly logger = new Logger(ReviewQueueService.name);

  constructor(
    @InjectModel(ReviewItem.name)
    private readonly reviewItemModel: Model<ReviewItemDocument>,
    private readonly tradeCallsService: TradeCallsService,
  ) {}

  /**
   * Creates a ReviewItem from a message.needs_review event payload.
   */
  async createFromEvent(
    data: MessageNeedsReviewPayload,
  ): Promise<ReviewItemDocument> {
    const item = await this.reviewItemModel.create({
      raw_message_id: data.raw_message_id,
      source_channel: data.source_channel,
      raw_text: data.raw_text,
      confidence: data.confidence,
      reason: data.reason,
      partial_fields: data.partial_fields ?? {},
      status: ReviewStatus.PENDING,
    });

    this.logger.log(
      `Created review item ${item._id} for message ${data.raw_message_id}`,
    );

    return item;
  }

  /**
   * Returns all review items, optionally filtered by status.
   */
  async findAll(status?: ReviewStatus): Promise<ReviewItemDocument[]> {
    const filter: Record<string, unknown> = {};
    if (status) {
      filter['status'] = status;
    }
    return this.reviewItemModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  /**
   * Returns a single review item by its Mongoose _id.
   */
  async findById(id: string): Promise<ReviewItemDocument> {
    const item = await this.reviewItemModel.findById(id).exec();
    if (!item) {
      throw new NotFoundException(`ReviewItem ${id} not found`);
    }
    return item;
  }

  /**
   * Promotes a review item: marks it PROMOTED and creates an ACTIVE TradeCall.
   *
   * The admin must supply the fields that the parser could not confidently extract.
   */
  async promote(
    id: string,
    dto: PromoteReviewDto,
    adminId: string,
  ): Promise<TradeCallDocument> {
    const item = await this.findById(id);

    if (item.status !== ReviewStatus.PENDING) {
      throw new BadRequestException(
        `Review item is already ${item.status} and cannot be promoted`,
      );
    }

    // Build equal-split if not supplied
    const targetCount = dto.targets.length;
    const targetSplit =
      dto.target_split ??
      Array.from<number>({ length: targetCount }).fill(
        parseFloat((100 / targetCount).toFixed(2)),
      );

    // Construct the create DTO with high confidence so it gets status ACTIVE
    const createDto: Parameters<TradeCallsService['createFromEvent']>[0] = {
      raw_message_id: item.raw_message_id,
      source_channel: item.source_channel ?? '',
      instrument: dto.instrument,
      segment: dto.segment,
      direction: dto.direction,
      entry_price: dto.entry_price,
      stop_loss: dto.stop_loss,
      targets: dto.targets,
      target_split: targetSplit,
      trailing_sl: dto.trailing_sl ?? true,
      risk_pct: null,
      confidence: 1.0, // admin-promoted → force ACTIVE
      model_version: 'manual-review',
    };

    const tradeCall = await this.tradeCallsService.createFromEvent(createDto);

    // Publish activated event since the call is now ACTIVE
    await this.tradeCallsService.publishActivatedEvent(tradeCall);

    item.status = ReviewStatus.PROMOTED;
    item.reviewed_by = adminId;
    item.reviewed_at = new Date();
    await item.save();

    this.logger.log(
      `Review item ${id} promoted to trade call ${tradeCall._id} by ${adminId}`,
    );

    return tradeCall;
  }

  /**
   * Rejects a review item; marks it REJECTED.
   */
  async reject(id: string, adminId: string): Promise<ReviewItemDocument> {
    const item = await this.findById(id);

    if (item.status !== ReviewStatus.PENDING) {
      throw new BadRequestException(
        `Review item is already ${item.status} and cannot be rejected`,
      );
    }

    item.status = ReviewStatus.REJECTED;
    item.reviewed_by = adminId;
    item.reviewed_at = new Date();

    const saved = await item.save();

    this.logger.log(`Review item ${id} rejected by ${adminId}`);

    return saved;
  }
}
