import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { Segment, TradeCallStatus } from '@cai/types';

export class QueryTradeCallsDto {
  @ApiPropertyOptional({ enum: TradeCallStatus, description: 'Filter by status' })
  @IsOptional()
  @IsEnum(TradeCallStatus)
  status?: TradeCallStatus;

  @ApiPropertyOptional({ enum: Segment, description: 'Filter by market segment' })
  @IsOptional()
  @IsEnum(Segment)
  segment?: Segment;

  @ApiPropertyOptional({ description: 'Filter by channel ID' })
  @IsOptional()
  @IsString()
  channel_id?: string;

  @ApiPropertyOptional({ description: 'Filter by instrument symbol (case-insensitive)' })
  @IsOptional()
  @IsString()
  instrument?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1, description: 'Page number' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, description: 'Items per page' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;
}
