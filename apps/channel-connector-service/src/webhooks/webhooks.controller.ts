import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  RawBodyRequest,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from '@nestjs/config';
import { Public } from '../common/decorators/public.decorator';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { RawMessagesService } from '../raw-messages/raw-messages.service';
import { QueuePublisher } from '../queue/queue.publisher';
import { TelegramAdapter, TelegramUpdate } from '../adapters/telegram/telegram.adapter';
import { WhatsAppAdapter, WhatsAppWebhookBody } from '../adapters/whatsapp/whatsapp.adapter';
import { TelegramWebhookDto } from './dto/telegram-webhook.dto';
import { WhatsAppWebhookDto } from './dto/whatsapp-webhook.dto';
import { TestMessageDto } from './dto/test-message.dto';
import { SourcePlatform } from '@cai/types';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly rawMessagesService: RawMessagesService,
    private readonly queuePublisher: QueuePublisher,
    private readonly telegramAdapter: TelegramAdapter,
    private readonly whatsAppAdapter: WhatsAppAdapter,
    private readonly configService: ConfigService,
  ) {}

  // ─── Telegram ────────────────────────────────────────────────────────────────

  @Post('telegram')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Receive Telegram webhook updates' })
  @ApiHeader({
    name: 'x-telegram-bot-api-secret-token',
    description: 'Telegram webhook secret token for verification',
    required: false,
  })
  @ApiResponse({ status: 200, description: 'Update processed' })
  @ApiResponse({ status: 401, description: 'Invalid Telegram secret token' })
  async telegramWebhook(
    @Body() body: TelegramWebhookDto,
    @Headers('x-telegram-bot-api-secret-token') secretToken?: string,
  ): Promise<{ ok: boolean; message?: string }> {
    // Verify Telegram secret token when configured
    const expectedSecret = this.configService.get<string>('telegram.webhookSecret');
    if (expectedSecret && secretToken !== expectedSecret) {
      throw new UnauthorizedException('Invalid Telegram webhook secret');
    }

    const incoming = this.telegramAdapter.parse(body as TelegramUpdate);
    if (!incoming) {
      return { ok: true, message: 'No actionable message in update' };
    }

    try {
      const rawMessage = await this.rawMessagesService.createFromWebhook({
        platform: incoming.platform,
        message_id: incoming.message_id,
        source_channel: incoming.channel_id,
        sender_id: incoming.sender_id,
        raw_text: incoming.raw_text,
        media_urls: incoming.media_urls,
      });

      await this.queuePublisher.publishMessageReceived(
        String(rawMessage._id),
        incoming.platform,
        incoming.channel_id,
        incoming.sender_id,
        incoming.raw_text,
        rawMessage.received_at,
      );
    } catch (err: unknown) {
      // Swallow duplicate errors — Telegram retries on non-200 responses
      if (err instanceof Error && err.message.startsWith('Duplicate message')) {
        this.logger.warn(`Duplicate Telegram message skipped: ${err.message}`);
        return { ok: true, message: 'Duplicate message skipped' };
      }
      throw err;
    }

    return { ok: true };
  }

  // ─── WhatsApp Verification ────────────────────────────────────────────────

  @Get('whatsapp')
  @Public()
  @ApiOperation({ summary: 'WhatsApp webhook verification challenge' })
  @ApiQuery({ name: 'hub.mode', required: false, type: String })
  @ApiQuery({ name: 'hub.verify_token', required: false, type: String })
  @ApiQuery({ name: 'hub.challenge', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Returns hub.challenge on success' })
  @ApiResponse({ status: 400, description: 'Verification failed' })
  whatsAppVerify(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') verifyToken?: string,
    @Query('hub.challenge') challenge?: string,
  ): string {
    const expectedToken = this.configService.get<string>('whatsapp.verifyToken');

    if (mode === 'subscribe' && verifyToken === expectedToken) {
      this.logger.log('WhatsApp webhook verified successfully');
      return challenge ?? '';
    }

    throw new BadRequestException('WhatsApp webhook verification failed');
  }

  // ─── WhatsApp Messages ────────────────────────────────────────────────────

  @Post('whatsapp')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Receive WhatsApp Cloud API webhook events' })
  @ApiHeader({
    name: 'x-hub-signature-256',
    description: 'HMAC-SHA256 signature from WhatsApp for payload verification',
    required: true,
  })
  @ApiResponse({ status: 200, description: 'Event processed' })
  @ApiResponse({ status: 401, description: 'Invalid HMAC signature' })
  async whatsAppWebhook(
    @Body() body: WhatsAppWebhookDto,
    @Headers('x-hub-signature-256') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ ok: boolean; message?: string }> {
    const appSecret = this.configService.get<string>('whatsapp.appSecret') ?? '';

    // Use raw body for HMAC verification when available
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(body));
    if (!this.whatsAppAdapter.verifyWebhookSignature(rawBody, signature, appSecret)) {
      throw new UnauthorizedException('Invalid WhatsApp HMAC signature');
    }

    const incoming = this.whatsAppAdapter.parse(body as WhatsAppWebhookBody);
    if (!incoming) {
      return { ok: true, message: 'No actionable message in payload' };
    }

    try {
      const rawMessage = await this.rawMessagesService.createFromWebhook({
        platform: incoming.platform,
        message_id: incoming.message_id,
        source_channel: incoming.channel_id,
        sender_id: incoming.sender_id,
        raw_text: incoming.raw_text,
        media_urls: incoming.media_urls,
      });

      await this.queuePublisher.publishMessageReceived(
        String(rawMessage._id),
        incoming.platform,
        incoming.channel_id,
        incoming.sender_id,
        incoming.raw_text,
        rawMessage.received_at,
      );
    } catch (err: unknown) {
      if (err instanceof Error && err.message.startsWith('Duplicate message')) {
        this.logger.warn(`Duplicate WhatsApp message skipped: ${err.message}`);
        return { ok: true, message: 'Duplicate message skipped' };
      }
      throw err;
    }

    return { ok: true };
  }

  // ─── Test Endpoint ────────────────────────────────────────────────────────

  @Post('test')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Inject a test message without a real platform webhook' })
  @ApiHeader({ name: 'x-api-key', description: 'API key', required: true })
  @ApiResponse({ status: 201, description: 'Test message created and queued' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async testMessage(@Body() dto: TestMessageDto) {
    const fakeMessageId = `test-${uuidv4()}`;
    const sourceChannel = dto.source_channel ?? 'test-channel';
    const senderId = dto.sender_id ?? 'test-sender';

    // When quoted_text is provided, simulate a Telegram reply-chain so the parser
    // sees both the original signal and the follow-up (e.g. targets added later).
    const finalText = dto.quoted_text
      ? `[QUOTE]: ${dto.quoted_text}\n[REPLY]: ${dto.raw_text}`
      : dto.raw_text;

    const rawMessage = await this.rawMessagesService.createFromWebhook({
      platform: SourcePlatform.TELEGRAM,
      message_id: fakeMessageId,
      source_channel: sourceChannel,
      sender_id: senderId,
      raw_text: finalText,
      media_urls: [],
    });

    await this.queuePublisher.publishMessageReceived(
      String(rawMessage._id),
      SourcePlatform.TELEGRAM,
      sourceChannel,
      senderId,
      finalText,
      rawMessage.received_at,
    );

    return {
      success: true,
      data: rawMessage,
    };
  }
}
