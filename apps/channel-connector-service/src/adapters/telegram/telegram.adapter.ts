import { Injectable, Logger } from '@nestjs/common';
import { SourcePlatform } from '@cai/types';

export interface IncomingMessage {
  platform: SourcePlatform;
  channel_id: string;
  sender_id: string;
  message_id: string;
  raw_text: string;
  media_urls: string[];
}

interface TelegramMessageBase {
  message_id: number;
  chat: { id: number; title?: string; type: string };
  date?: number;
  text?: string;
  caption?: string;
  photo?: Array<{ file_id: string }>;
}

/**
 * Shape of a Telegram Update object (partial — only fields we use).
 */
export interface TelegramUpdate {
  update_id?: number;
  message?: TelegramMessageBase & {
    from?: { id: number; username?: string; first_name?: string };
    document?: { file_id: string };
    video?: { file_id: string };
    voice?: { file_id: string };
    audio?: { file_id: string };
    // Reply chain: the message this one is a reply to
    reply_to_message?: TelegramMessageBase & {
      from?: { id: number; username?: string };
    };
    // Telegram forwards & quotes
    forward_from?: { id: number };
    quote?: { text: string };
  };
  channel_post?: TelegramMessageBase & {
    sender_chat?: { id: number };
    reply_to_message?: TelegramMessageBase;
  };
}

@Injectable()
export class TelegramAdapter {
  private readonly logger = new Logger(TelegramAdapter.name);

  /**
   * Parse a Telegram webhook update into a normalized IncomingMessage.
   * Handles both group/private messages and channel posts.
   */
  parse(update: TelegramUpdate): IncomingMessage | null {
    const msg = update.message ?? update.channel_post;
    if (!msg) {
      this.logger.warn(`Telegram update ${update.update_id} has no parseable message`);
      return null;
    }

    const chatId = String(msg.chat.id);
    const messageId = String(msg.message_id);

    // Base text of the current message
    let rawText = msg.text ?? msg.caption ?? '';

    // If this is a reply, prepend the quoted message so the LLM sees both parts.
    // Real Telegram replies often add targets/SL to a quoted instrument+direction message.
    const replyMsg = 'reply_to_message' in msg ? msg.reply_to_message : undefined;
    if (replyMsg) {
      const quotedText = replyMsg.text ?? replyMsg.caption ?? '';
      if (quotedText && rawText) {
        rawText = `[QUOTE]: ${quotedText}\n[REPLY]: ${rawText}`;
      } else if (quotedText) {
        rawText = quotedText; // reply is empty — use the quoted text alone
      }
    }

    let senderId: string;
    if (update.message && update.message.from) {
      senderId = String(update.message.from.id);
    } else if (update.channel_post && update.channel_post.sender_chat) {
      senderId = String(update.channel_post.sender_chat.id);
    } else {
      senderId = chatId;
    }

    // Collect media file IDs as placeholder URLs
    const mediaUrls: string[] = [];
    if (msg.photo && msg.photo.length > 0) {
      const largest = msg.photo[msg.photo.length - 1];
      mediaUrls.push(`tg://file/${largest.file_id}`);
    }
    if ('document' in msg && msg.document) {
      mediaUrls.push(`tg://file/${msg.document.file_id}`);
    }
    if ('video' in msg && msg.video) {
      mediaUrls.push(`tg://file/${msg.video.file_id}`);
    }
    if ('voice' in msg && msg.voice) {
      mediaUrls.push(`tg://file/${msg.voice.file_id}`);
    }
    if ('audio' in msg && msg.audio) {
      mediaUrls.push(`tg://file/${msg.audio.file_id}`);
    }

    return {
      platform: SourcePlatform.TELEGRAM,
      channel_id: chatId,
      sender_id: senderId,
      message_id: messageId,
      raw_text: rawText,
      media_urls: mediaUrls,
    };
  }
}
