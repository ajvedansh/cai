import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsObject, IsOptional } from 'class-validator';

class TelegramFrom {
  @ApiPropertyOptional({ description: 'Telegram user ID' })
  id?: number;

  @ApiPropertyOptional()
  username?: string;

  @ApiPropertyOptional()
  first_name?: string;
}

class TelegramChat {
  @ApiPropertyOptional({ description: 'Telegram chat ID' })
  id?: number;

  @ApiPropertyOptional()
  title?: string;

  @ApiPropertyOptional()
  type?: string;
}

class TelegramMessage {
  @ApiPropertyOptional({ description: 'Message ID within Telegram' })
  message_id?: number;

  @ApiPropertyOptional({ type: () => TelegramFrom })
  from?: TelegramFrom;

  @ApiPropertyOptional({ type: () => TelegramChat })
  chat?: TelegramChat;

  @ApiPropertyOptional()
  text?: string;

  @ApiPropertyOptional()
  caption?: string;

  @ApiPropertyOptional()
  date?: number;
}

export class TelegramWebhookDto {
  @ApiPropertyOptional({ description: 'Telegram update ID' })
  @IsOptional()
  @IsNumber()
  update_id?: number;

  @ApiPropertyOptional({ type: () => TelegramMessage, description: 'Message object for group/private messages' })
  @IsOptional()
  @IsObject()
  message?: TelegramMessage;

  @ApiPropertyOptional({ type: () => TelegramMessage, description: 'Channel post for channel updates' })
  @IsOptional()
  @IsObject()
  channel_post?: TelegramMessage;
}
