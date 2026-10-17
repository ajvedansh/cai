import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { SourcePlatform, Segment } from '@cai/types';

export type ChannelDocument = ChannelEntity & Document;

@Schema({ timestamps: true, collection: 'channels' })
export class ChannelEntity {
  @Prop({
    required: true,
    enum: Object.values(SourcePlatform),
    index: true,
  })
  platform!: SourcePlatform;

  @Prop({ required: true, index: true })
  channel_id!: string;

  @Prop({ required: true })
  display_name!: string;

  @Prop({ required: true })
  influencer_id!: string;

  @Prop({
    type: [String],
    enum: Object.values(Segment),
    default: [],
  })
  segment_focus!: Segment[];

  @Prop({ required: true, default: true, index: true })
  active!: boolean;

  @Prop({ required: true, default: () => new Date() })
  added_at!: Date;
}

export const ChannelSchema = SchemaFactory.createForClass(ChannelEntity);

// Unique compound index: one entry per platform+channel_id pair
ChannelSchema.index({ platform: 1, channel_id: 1 }, { unique: true });
