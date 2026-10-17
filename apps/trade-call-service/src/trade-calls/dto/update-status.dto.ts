import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TradeCallStatus } from '@cai/types';

export class UpdateStatusDto {
  @ApiProperty({ enum: TradeCallStatus, description: 'New status for the trade call' })
  @IsEnum(TradeCallStatus)
  status: TradeCallStatus;

  @ApiPropertyOptional({ description: 'Optional note explaining the status change' })
  @IsOptional()
  @IsString()
  review_note?: string;
}
