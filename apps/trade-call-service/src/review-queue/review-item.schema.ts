import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { ReviewStatus } from '@cai/types';

export type ReviewItemDocument = HydratedDocument<ReviewItem>;

@Schema({ timestamps: true, collection: 'review_items' })
export class ReviewItem {
  @Prop({ required: true, index: true })
  raw_message_id: string;

  @Prop({ default: null })
  source_channel: string;

  @Prop({ required: true })
  raw_text: string;

  @Prop({ required: true, type: Number, min: 0, max: 1 })
  confidence: number;

  @Prop({ required: true })
  reason: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  partial_fields: Record<string, unknown>;

  @Prop({
    required: true,
    type: String,
    enum: Object.values(ReviewStatus),
    default: ReviewStatus.PENDING,
    index: true,
  })
  status: ReviewStatus;

  @Prop({ type: String, default: null })
  reviewed_by: string | null;

  @Prop({ type: Date, default: null })
  reviewed_at: Date | null;
}

export const ReviewItemSchema = SchemaFactory.createForClass(ReviewItem);
