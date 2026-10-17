import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { SourcePlatform, RawMessageStatus } from '@cai/types';

export type RawMessageDocument = RawMessageEntity & Document;

@Schema({ timestamps: true, collection: 'raw_messages' })
export class RawMessageEntity {
  @Prop({ required: true, index: true })
  message_id!: string;

  @Prop({
    required: true,
    enum: Object.values(SourcePlatform),
    index: true,
  })
  source_platform!: SourcePlatform;

  @Prop({ required: true, index: true })
  source_channel!: string;

  @Prop({ required: true })
  sender_id!: string;

  @Prop({ required: true })
  raw_text!: string;

  @Prop({ type: [String], default: [] })
  media_urls!: string[];

  @Prop({ required: true, default: () => new Date() })
  received_at!: Date;

  @Prop({
    required: true,
    enum: Object.values(RawMessageStatus),
    default: RawMessageStatus.QUEUED,
    index: true,
  })
  status!: RawMessageStatus;

  @Prop({ type: String, default: null })
  trade_call_id!: string | null;

  @Prop({ required: true, unique: true, index: true })
  dedup_hash!: string;
}

export const RawMessageSchema = SchemaFactory.createForClass(RawMessageEntity);

// Compound index for efficient dedup lookups
RawMessageSchema.index({ source_platform: 1, message_id: 1 }, { unique: true });
