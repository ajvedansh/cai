import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash } from 'crypto';
import { InjectRedis } from '../queue/redis.provider';
import { Redis } from 'ioredis';
import { RawMessageDocument, RawMessageEntity } from './raw-message.schema';
import { SourcePlatform, RawMessageStatus } from '@cai/types';

export interface CreateRawMessageDto {
  platform: SourcePlatform;
  message_id: string;
  source_channel: string;
  sender_id: string;
  raw_text: string;
  media_urls?: string[];
}

export interface PaginatedQuery {
  page?: number;
  limit?: number;
  status?: RawMessageStatus;
  source_channel?: string;
}

const DEDUP_TTL_SECONDS = 86400; // 24 hours

@Injectable()
export class RawMessagesService {
  private readonly logger = new Logger(RawMessagesService.name);

  constructor(
    @InjectModel(RawMessageEntity.name)
    private readonly rawMessageModel: Model<RawMessageDocument>,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  /**
   * Compute a SHA-256 dedup hash from platform + message_id.
   */
  private computeDedupHash(platform: SourcePlatform, messageId: string): string {
    return createHash('sha256')
      .update(`${platform}:${messageId}`)
      .digest('hex');
  }

  /**
   * Create a raw message from an incoming webhook payload.
   * Checks Redis for duplicates before persisting.
   */
  async createFromWebhook(dto: CreateRawMessageDto): Promise<RawMessageDocument> {
    const dedupHash = this.computeDedupHash(dto.platform, dto.message_id);
    const redisKey = `dedup:${dedupHash}`;

    // Check Redis dedup cache first (fast path)
    const exists = await this.redis.get(redisKey);
    if (exists) {
      this.logger.warn(
        `Duplicate message detected via Redis: ${dto.platform}:${dto.message_id}`,
      );
      throw new ConflictException(`Duplicate message: ${dto.message_id}`);
    }

    // Persist to MongoDB
    let saved: RawMessageDocument;
    try {
      const doc = new this.rawMessageModel({
        message_id: dto.message_id,
        source_platform: dto.platform,
        source_channel: dto.source_channel,
        sender_id: dto.sender_id,
        raw_text: dto.raw_text,
        media_urls: dto.media_urls ?? [],
        received_at: new Date(),
        status: RawMessageStatus.QUEUED,
        trade_call_id: null,
        dedup_hash: dedupHash,
      });
      saved = await doc.save();
    } catch (err: unknown) {
      // Handle MongoDB duplicate key error (code 11000)
      if (
        err instanceof Error &&
        'code' in err &&
        (err as NodeJS.ErrnoException).code === '11000'
      ) {
        throw new ConflictException(`Duplicate message: ${dto.message_id}`);
      }
      throw err;
    }

    // Cache dedup hash in Redis
    await this.redis.setex(redisKey, DEDUP_TTL_SECONDS, '1');

    this.logger.log(
      `Saved raw message ${String(saved._id)} from ${dto.platform}:${dto.source_channel}`,
    );
    return saved;
  }

  /**
   * Paginated list of raw messages with optional filters.
   */
  async findAll(query: PaginatedQuery): Promise<{
    data: RawMessageDocument[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (query.status) {
      filter['status'] = query.status;
    }
    if (query.source_channel) {
      filter['source_channel'] = query.source_channel;
    }

    const [data, total] = await Promise.all([
      this.rawMessageModel
        .find(filter)
        .sort({ received_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.rawMessageModel.countDocuments(filter).exec(),
    ]);

    return { data: data as unknown as RawMessageDocument[], total, page, limit };
  }

  /**
   * Find a single raw message by its MongoDB _id.
   */
  async findById(id: string): Promise<RawMessageDocument> {
    const doc = await this.rawMessageModel.findById(id).lean().exec();
    if (!doc) {
      throw new NotFoundException(`RawMessage not found: ${id}`);
    }
    return doc as unknown as RawMessageDocument;
  }

  /**
   * Update the status of a raw message, optionally setting trade_call_id.
   */
  async updateStatus(
    id: string,
    status: RawMessageStatus,
    tradeCallId?: string,
  ): Promise<RawMessageDocument> {
    const update: Record<string, unknown> = { status };
    if (tradeCallId !== undefined) {
      update['trade_call_id'] = tradeCallId;
    }

    const doc = await this.rawMessageModel
      .findByIdAndUpdate(id, { $set: update }, { new: true })
      .lean()
      .exec();

    if (!doc) {
      throw new NotFoundException(`RawMessage not found: ${id}`);
    }

    return doc as unknown as RawMessageDocument;
  }
}
