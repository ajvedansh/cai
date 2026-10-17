import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { RawMessagesService } from './raw-messages.service';
import { RawMessageStatus } from '@cai/types';

@ApiTags('raw-messages')
@ApiHeader({ name: 'x-api-key', description: 'API key for authentication', required: true })
@UseGuards(ApiKeyGuard)
@Controller('raw-messages')
export class RawMessagesController {
  constructor(private readonly rawMessagesService: RawMessagesService) {}

  @Get()
  @ApiOperation({ summary: 'List raw messages with pagination and optional filters' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Page size (default: 20, max: 100)' })
  @ApiQuery({ name: 'status', required: false, enum: RawMessageStatus, description: 'Filter by status' })
  @ApiQuery({ name: 'source_channel', required: false, type: String, description: 'Filter by source channel' })
  @ApiResponse({ status: 200, description: 'Paginated list of raw messages' })
  @ApiResponse({ status: 401, description: 'Unauthorized — invalid or missing API key' })
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: RawMessageStatus,
    @Query('source_channel') source_channel?: string,
  ) {
    const result = await this.rawMessagesService.findAll({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      status,
      source_channel,
    });

    return {
      success: true,
      data: result.data,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
      },
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single raw message by ID' })
  @ApiParam({ name: 'id', type: String, description: 'MongoDB ObjectId of the raw message' })
  @ApiResponse({ status: 200, description: 'The raw message document' })
  @ApiResponse({ status: 401, description: 'Unauthorized — invalid or missing API key' })
  @ApiResponse({ status: 404, description: 'Raw message not found' })
  async findById(@Param('id') id: string) {
    const doc = await this.rawMessagesService.findById(id);
    return { success: true, data: doc };
  }
}
