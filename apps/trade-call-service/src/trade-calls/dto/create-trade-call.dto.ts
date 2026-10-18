import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsNumber,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  IsBoolean,
  IsOptional,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Direction, Segment } from '@cai/types';

export class CreateTradeCallDto {
  @ApiProperty({ description: 'ID of the raw message that generated this call' })
  @IsString()
  @IsNotEmpty()
  raw_message_id: string;

  @ApiProperty({ description: 'Channel (group/channel ID) the message came from' })
  @IsString()
  @IsNotEmpty()
  source_channel: string;

  @ApiProperty({ example: 'NIFTY50', description: 'Trading instrument symbol' })
  @IsString()
  @IsNotEmpty()
  instrument: string;

  @ApiProperty({ enum: Segment, description: 'Market segment' })
  @IsEnum(Segment)
  segment: Segment;

  @ApiProperty({ enum: Direction, description: 'Trade direction' })
  @IsEnum(Direction)
  direction: Direction;

  @ApiProperty({ example: 22500, description: 'Entry price' })
  @IsNumber()
  @Min(0)
  entry_price: number;

  @ApiProperty({ example: 22300, description: 'Initial stop-loss price' })
  @IsNumber()
  @Min(0)
  stop_loss: number;

  @ApiProperty({ example: [22700, 22900, 23100], description: 'Target price levels (max 3)' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsNumber({}, { each: true })
  targets: number[];

  @ApiProperty({ example: [40, 30, 30], description: 'Percentage split per target; must sum to 100' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsNumber({}, { each: true })
  target_split: number[];

  @ApiPropertyOptional({ default: true, description: 'Whether to trail stop-loss after each target' })
  @IsOptional()
  @IsBoolean()
  trailing_sl?: boolean;

  @ApiPropertyOptional({ example: 1.5, description: 'Risk percentage of capital (nullable)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  risk_pct?: number | null;

  @ApiProperty({ example: 0.92, description: 'Model confidence score (0–1)' })
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence: number;

  @ApiProperty({ example: 'signal-parser-v2.1.0', description: 'Parser model version' })
  @IsString()
  @IsNotEmpty()
  model_version: string;

  @ApiPropertyOptional({ description: 'Full structured JSON the LLM extracted' })
  @IsOptional()
  parsed_data?: Record<string, unknown>;
}
