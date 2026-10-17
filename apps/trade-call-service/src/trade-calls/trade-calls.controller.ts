import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { TradeCallsService } from './trade-calls.service';
import { QueryTradeCallsDto } from './dto/query-trade-calls.dto';
import { UpdateStatusDto } from './dto/update-status.dto';

@ApiTags('trade-calls')
@ApiHeader({
  name: 'x-api-key',
  description: 'API key for authentication',
  required: true,
})
@ApiUnauthorizedResponse({ description: 'Missing or invalid API key' })
@UseGuards(ApiKeyGuard, ThrottlerGuard)
@Controller('trade-calls')
export class TradeCallsController {
  constructor(private readonly tradeCallsService: TradeCallsService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Aggregated stats: count by status and segment' })
  @ApiOkResponse({
    description: 'Stats aggregation',
    schema: {
      example: {
        success: true,
        data: {
          total: 120,
          byStatus: { ACTIVE: 45, PENDING: 10, CLOSED_SL: 65 },
          bySegment: { EQUITY: 80, F_AND_O: 40 },
        },
      },
    },
  })
  async getStats() {
    const stats = await this.tradeCallsService.getStats();
    return { success: true, data: stats };
  }

  @Get()
  @ApiOperation({ summary: 'List all trade calls with optional filters and pagination' })
  @ApiOkResponse({
    description: 'Paginated list of trade calls',
    schema: {
      example: {
        success: true,
        data: [],
        meta: { total: 0, page: 1, limit: 20 },
      },
    },
  })
  async findAll(@Query() query: QueryTradeCallsDto) {
    const result = await this.tradeCallsService.findAll(query);
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
  @ApiOperation({ summary: 'Get a single trade call by ID' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the trade call' })
  @ApiOkResponse({ description: 'Trade call document' })
  @ApiNotFoundResponse({ description: 'Trade call not found' })
  async findById(@Param('id') id: string) {
    const doc = await this.tradeCallsService.findById(id);
    return { success: true, data: doc };
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update the status of a trade call via the state machine' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the trade call' })
  @ApiOkResponse({ description: 'Updated trade call' })
  @ApiNotFoundResponse({ description: 'Trade call not found' })
  @ApiResponse({ status: 400, description: 'Invalid state transition' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    const doc = await this.tradeCallsService.updateStatus(id, dto);
    return { success: true, data: doc };
  }

  @Post(':id/activate')
  @ApiOperation({
    summary: 'Admin: promote a PENDING trade call to ACTIVE and emit trade_call.activated event',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the trade call' })
  @ApiOkResponse({ description: 'Activated trade call' })
  @ApiNotFoundResponse({ description: 'Trade call not found' })
  @ApiResponse({ status: 400, description: 'Trade call is not in PENDING status' })
  async activate(@Param('id') id: string) {
    const doc = await this.tradeCallsService.activate(id);
    return { success: true, data: doc };
  }
}
