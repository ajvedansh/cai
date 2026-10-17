import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  ArrayMinSize,
  ArrayMaxSize,
  IsNotEmpty,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Direction, Segment } from '@cai/types';

export class PromoteReviewDto {
  @ApiProperty({ example: 'NIFTY50', description: 'Instrument symbol confirmed by admin' })
  @IsString()
  @IsNotEmpty()
  instrument: string;

  @ApiProperty({ enum: Segment, description: 'Market segment confirmed by admin' })
  @IsEnum(Segment)
  segment: Segment;

  @ApiProperty({ enum: Direction, description: 'Trade direction confirmed by admin' })
  @IsEnum(Direction)
  direction: Direction;

  @ApiProperty({ example: 22500, description: 'Entry price' })
  @IsNumber()
  @Min(0)
  entry_price: number;

  @ApiProperty({ example: 22300, description: 'Stop-loss price' })
  @IsNumber()
  @Min(0)
  stop_loss: number;

  @ApiProperty({ example: [22700, 22900], description: 'Target price levels (max 3)' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsNumber({}, { each: true })
  targets: number[];

  @ApiPropertyOptional({
    example: [50, 50],
    description: 'Percentage split per target; must sum to 100. Defaults to equal split.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsNumber({}, { each: true })
  target_split?: number[];

  @ApiPropertyOptional({ default: true, description: 'Trail stop-loss after each target hit' })
  @IsOptional()
  @IsBoolean()
  trailing_sl?: boolean;
}
