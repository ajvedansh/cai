import { Controller, Get, Sse, MessageEvent, Header } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { EventsService, UiUpdateEvent } from './events.service';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('events')
@Controller('api/v1')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  // No API key required — read-only stream. CORS headers allow direct browser connection
  // from the Vercel frontend, bypassing the Vercel Edge Function proxy timeout (30s limit).
  @Public()
  @Get('events')
  @Sse('events')
  @Header('Cache-Control', 'no-cache')
  @Header('X-Accel-Buffering', 'no')
  @ApiOperation({ summary: 'Server-Sent Events stream for real-time UI updates' })
  stream(): Observable<MessageEvent> {
    return this.eventsService.getUpdates$().pipe(
      map((event: UiUpdateEvent): MessageEvent => ({
        data: event,
        type: event.type,
      })),
    );
  }
}
