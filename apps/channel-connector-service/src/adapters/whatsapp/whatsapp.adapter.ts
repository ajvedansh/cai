import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { SourcePlatform } from '@cai/types';
import { IncomingMessage } from '../telegram/telegram.adapter';

/**
 * Partial shape of a WhatsApp Cloud API webhook payload.
 */
export interface WhatsAppWebhookBody {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      value?: {
        messaging_product?: string;
        metadata?: { display_phone_number?: string; phone_number_id?: string };
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
        messages?: Array<{
          id: string;
          from: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
          image?: { id?: string; mime_type?: string; caption?: string };
          video?: { id?: string; mime_type?: string; caption?: string };
          audio?: { id?: string; mime_type?: string };
          document?: { id?: string; mime_type?: string; filename?: string; caption?: string };
        }>;
      };
      field?: string;
    }>;
  }>;
}

@Injectable()
export class WhatsAppAdapter {
  private readonly logger = new Logger(WhatsAppAdapter.name);

  /**
   * Verify HMAC-SHA256 signature supplied by WhatsApp in X-Hub-Signature-256.
   * @param rawBody  Raw request body buffer / string (before JSON.parse)
   * @param signatureHeader  Value of the X-Hub-Signature-256 header
   * @param appSecret  WhatsApp App Secret
   */
  verifyWebhookSignature(
    rawBody: string | Buffer,
    signatureHeader: string,
    appSecret: string,
  ): boolean {
    if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
      return false;
    }
    const expected = signatureHeader.slice('sha256='.length);

    const hmac = createHmac('sha256', appSecret);
    hmac.update(rawBody);
    const computed = hmac.digest('hex');

    try {
      return timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
      return false;
    }
  }

  /**
   * Parse a WhatsApp Cloud API webhook payload into a normalized IncomingMessage.
   * Returns null if the payload contains no actionable message.
   */
  parse(body: WhatsAppWebhookBody): IncomingMessage | null {
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const waMessage = value?.messages?.[0];

    if (!waMessage) {
      this.logger.warn('WhatsApp webhook had no messages in payload');
      return null;
    }

    const channelId = value?.metadata?.phone_number_id ?? entry?.id ?? 'unknown';
    const senderId = waMessage.from;
    const messageId = waMessage.id;

    // Extract text content
    let rawText = '';
    if (waMessage.type === 'text') {
      rawText = waMessage.text?.body ?? '';
    } else if (waMessage.image?.caption) {
      rawText = waMessage.image.caption;
    } else if (waMessage.video?.caption) {
      rawText = waMessage.video.caption;
    } else if (waMessage.document?.caption) {
      rawText = waMessage.document.caption;
    }

    // Collect media references
    const mediaUrls: string[] = [];
    if (waMessage.image?.id) {
      mediaUrls.push(`wa://media/${waMessage.image.id}`);
    }
    if (waMessage.video?.id) {
      mediaUrls.push(`wa://media/${waMessage.video.id}`);
    }
    if (waMessage.audio?.id) {
      mediaUrls.push(`wa://media/${waMessage.audio.id}`);
    }
    if (waMessage.document?.id) {
      mediaUrls.push(`wa://media/${waMessage.document.id}`);
    }

    return {
      platform: SourcePlatform.WHATSAPP,
      channel_id: channelId,
      sender_id: senderId,
      message_id: messageId,
      raw_text: rawText,
      media_urls: mediaUrls,
    };
  }
}
