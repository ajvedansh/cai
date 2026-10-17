import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

class WhatsAppMessageText {
  @ApiPropertyOptional({ description: 'Text body of the message' })
  body?: string;
}

class WhatsAppMessage {
  @ApiPropertyOptional({ description: 'WhatsApp message ID' })
  id?: string;

  @ApiPropertyOptional({ description: 'Sender phone number' })
  from?: string;

  @ApiPropertyOptional({ description: 'Unix timestamp' })
  timestamp?: string;

  @ApiPropertyOptional({ description: 'Message type (text, image, video, etc.)' })
  type?: string;

  @ApiPropertyOptional({ type: () => WhatsAppMessageText })
  text?: WhatsAppMessageText;
}

class WhatsAppMetadata {
  @ApiPropertyOptional()
  display_phone_number?: string;

  @ApiPropertyOptional()
  phone_number_id?: string;
}

class WhatsAppValue {
  @ApiPropertyOptional()
  messaging_product?: string;

  @ApiPropertyOptional({ type: () => WhatsAppMetadata })
  metadata?: WhatsAppMetadata;

  @ApiPropertyOptional({ type: [WhatsAppMessage] })
  messages?: WhatsAppMessage[];
}

class WhatsAppChange {
  @ApiPropertyOptional({ type: () => WhatsAppValue })
  value?: WhatsAppValue;

  @ApiPropertyOptional()
  field?: string;
}

class WhatsAppEntry {
  @ApiPropertyOptional()
  id?: string;

  @ApiPropertyOptional({ type: [WhatsAppChange] })
  changes?: WhatsAppChange[];
}

export class WhatsAppWebhookDto {
  @ApiPropertyOptional({ description: 'Should be "whatsapp_business_account"' })
  @IsOptional()
  @IsString()
  object?: string;

  @ApiPropertyOptional({ type: [WhatsAppEntry] })
  @IsOptional()
  @IsArray()
  entry?: WhatsAppEntry[];
}
