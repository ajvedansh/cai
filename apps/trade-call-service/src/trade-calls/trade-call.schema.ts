import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Direction, Segment, TradeCallStatus } from '@cai/types';

export type TradeCallDocument = HydratedDocument<TradeCall>;

@Schema({ timestamps: true, collection: 'trade_calls' })
export class TradeCall {
  @Prop({ required: true, unique: true, index: true })
  raw_message_id: string;

  @Prop({ required: true, index: true })
  channel_id: string;

  @Prop({ default: null })
  influencer_id: string;

  @Prop({
    required: true,
    uppercase: true,
    trim: true,
    index: true,
  })
  instrument: string;

  @Prop({
    required: true,
    type: String,
    enum: Object.values(Segment),
    index: true,
  })
  segment: Segment;

  @Prop({
    required: true,
    type: String,
    enum: Object.values(Direction),
  })
  direction: Direction;

  @Prop({ required: true, type: Number })
  entry_price: number;

  @Prop({ required: true, type: Number })
  initial_sl: number;

  @Prop({ required: true, type: Number })
  current_sl: number;

  @Prop({ required: true, type: [Number], validate: { validator: (v: number[]) => v.length <= 3, message: 'targets must have at most 3 entries' } })
  targets: number[];

  @Prop({
    required: true,
    type: [Number],
    validate: {
      validator: (v: number[]) => {
        const sum = v.reduce((acc, n) => acc + n, 0);
        return Math.abs(sum - 100) < 0.01;
      },
      message: 'target_split must sum to 100',
    },
  })
  target_split: number[];

  @Prop({ type: [Boolean], default: [] })
  targets_hit: boolean[];

  @Prop({ type: Boolean, default: true })
  trailing_sl: boolean;

  @Prop({ type: Number, default: null })
  risk_pct: number | null;

  @Prop({ required: true, type: Number, min: 0, max: 1 })
  confidence: number;

  @Prop({ required: true })
  model_version: string;

  @Prop({
    required: true,
    type: String,
    enum: Object.values(TradeCallStatus),
    default: TradeCallStatus.PENDING,
    index: true,
  })
  status: TradeCallStatus;

  @Prop({ type: String, default: null })
  review_note: string | null;

  @Prop({ type: Date, default: null })
  activated_at: Date | null;

  @Prop({ type: Date, default: null })
  closed_at: Date | null;

  // Full structured JSON the LLM extracted — stored verbatim for auditability
  @Prop({ type: Object, default: null })
  parsed_data: Record<string, unknown> | null;

  // Snapshot of previous field values pushed on every update
  @Prop({ type: [Object], default: [] })
  update_history: Record<string, unknown>[];
}

export const TradeCallSchema = SchemaFactory.createForClass(TradeCall);

// Compound indexes for dedup logic
TradeCallSchema.index(
  { instrument: 1, channel_id: 1, status: 1, createdAt: -1 },
  { name: 'instrument_channel_status' },
);
