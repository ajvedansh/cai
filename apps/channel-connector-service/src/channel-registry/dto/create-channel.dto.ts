import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SourcePlatform, Segment } from '@cai/types';

export class CreateChannelDto {
  @ApiProperty({
    enum: SourcePlatform,
    description: 'Source platform for this channel',
    example: SourcePlatform.TELEGRAM,
  })
  @IsEnum(SourcePlatform)
  platform!: SourcePlatform;

  @ApiProperty({
    description: 'Unique channel identifier on the platform (e.g. Telegram chat ID)',
    example: '-1001234567890',
  })
  @IsString()
  @IsNotEmpty()
  channel_id!: string;

  @ApiProperty({
    description: 'Human-readable display name for this channel',
    example: 'Alpha Signals Pro',
  })
  @IsString()
  @IsNotEmpty()
  display_name!: string;

  @ApiProperty({
    description: 'Internal influencer / analyst identifier',
    example: 'influencer_abc123',
  })
  @IsString()
  @IsNotEmpty()
  influencer_id!: string;

  @ApiPropertyOptional({
    enum: Segment,
    isArray: true,
    description: 'Market segments this channel focuses on',
    example: [Segment.EQUITY, Segment.F_AND_O],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(Segment, { each: true })
  segment_focus?: Segment[];

  @ApiPropertyOptional({
    description: 'Whether this channel is active and should receive messages',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
