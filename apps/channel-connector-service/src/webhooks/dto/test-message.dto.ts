import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class TestMessageDto {
  @ApiProperty({
    description: 'Raw text content of the test message',
    example: 'BUY RELIANCE 2850 SL 2780 TGT 2920 2960',
  })
  @IsString()
  @IsNotEmpty()
  raw_text!: string;

  @ApiPropertyOptional({
    description: 'Source channel identifier (defaults to "test-channel")',
    example: 'test-channel-001',
  })
  @IsOptional()
  @IsString()
  source_channel?: string;

  @ApiPropertyOptional({
    description: 'Sender identifier (defaults to "test-sender")',
    example: 'test-user-001',
  })
  @IsOptional()
  @IsString()
  sender_id?: string;

  @ApiPropertyOptional({
    description:
      'Simulates a Telegram reply: this text is treated as the original quoted message. ' +
      'The LLM sees both parts joined as [QUOTE]: <quoted_text>\\n[REPLY]: <raw_text>.',
    example: 'BUY RELIANCE @ 2850 SL 2780',
  })
  @IsOptional()
  @IsString()
  quoted_text?: string;
}
