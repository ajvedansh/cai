import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ChannelDocument, ChannelEntity } from './channel.schema';
import { CreateChannelDto } from './dto/create-channel.dto';
import { SourcePlatform } from '@cai/types';

@Injectable()
export class ChannelRegistryService {
  private readonly logger = new Logger(ChannelRegistryService.name);

  constructor(
    @InjectModel(ChannelEntity.name)
    private readonly channelModel: Model<ChannelDocument>,
  ) {}

  async findAll(): Promise<ChannelDocument[]> {
    return this.channelModel.find().sort({ added_at: -1 }).lean().exec() as unknown as ChannelDocument[];
  }

  async findById(id: string): Promise<ChannelDocument> {
    const doc = await this.channelModel.findById(id).lean().exec();
    if (!doc) {
      throw new NotFoundException(`Channel not found: ${id}`);
    }
    return doc as unknown as ChannelDocument;
  }

  async create(dto: CreateChannelDto): Promise<ChannelDocument> {
    try {
      const doc = new this.channelModel({
        platform: dto.platform,
        channel_id: dto.channel_id,
        display_name: dto.display_name,
        influencer_id: dto.influencer_id,
        segment_focus: dto.segment_focus ?? [],
        active: dto.active ?? true,
        added_at: new Date(),
      });
      const saved = await doc.save();
      this.logger.log(`Registered channel ${dto.channel_id} on ${dto.platform}`);
      return saved;
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        'code' in err &&
        (err as NodeJS.ErrnoException).code === '11000'
      ) {
        throw new ConflictException(
          `Channel ${dto.channel_id} on ${dto.platform} is already registered`,
        );
      }
      throw err;
    }
  }

  async toggleActive(id: string): Promise<ChannelDocument> {
    const doc = await this.channelModel.findById(id).exec();
    if (!doc) {
      throw new NotFoundException(`Channel not found: ${id}`);
    }
    doc.active = !doc.active;
    await doc.save();
    this.logger.log(`Channel ${id} active set to ${doc.active}`);
    return doc;
  }

  /**
   * Check whether a channel is registered and currently active.
   * Used internally by webhook handlers.
   */
  async isActive(platform: SourcePlatform, channelId: string): Promise<boolean> {
    const doc = await this.channelModel
      .findOne({ platform, channel_id: channelId, active: true })
      .lean()
      .exec();
    return doc !== null;
  }
}
