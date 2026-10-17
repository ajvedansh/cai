import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
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
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { ReviewQueueService } from './review-queue.service';
import { PromoteReviewDto } from './dto/promote-review.dto';
import { ReviewStatus } from '@cai/types';

@ApiTags('review-queue')
@ApiHeader({
  name: 'x-api-key',
  description: 'API key for authentication',
  required: true,
})
@ApiUnauthorizedResponse({ description: 'Missing or invalid API key' })
@UseGuards(ApiKeyGuard, ThrottlerGuard)
@Controller('review-queue')
export class ReviewQueueController {
  constructor(private readonly reviewQueueService: ReviewQueueService) {}

  @Get()
  @ApiOperation({ summary: 'List review queue items, optionally filtered by status' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ReviewStatus,
    description: 'Filter by review status',
  })
  @ApiOkResponse({ description: 'List of review items' })
  async findAll(@Query('status') status?: ReviewStatus) {
    const items = await this.reviewQueueService.findAll(status);
    return { success: true, data: items };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single review item by ID' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the review item' })
  @ApiOkResponse({ description: 'Review item' })
  @ApiNotFoundResponse({ description: 'Review item not found' })
  async findById(@Param('id') id: string) {
    const item = await this.reviewQueueService.findById(id);
    return { success: true, data: item };
  }

  @Post(':id/promote')
  @ApiOperation({
    summary: 'Promote a review item: admin fills missing fields, creates an ACTIVE TradeCall',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the review item' })
  @ApiOkResponse({ description: 'Newly created (ACTIVE) TradeCall document' })
  @ApiNotFoundResponse({ description: 'Review item not found' })
  @ApiResponse({ status: 400, description: 'Review item is not in PENDING status' })
  @ApiHeader({
    name: 'x-admin-id',
    description: 'Identifier of the admin performing the action',
    required: false,
  })
  async promote(
    @Param('id') id: string,
    @Body() dto: PromoteReviewDto,
    @Headers('x-admin-id') adminId = 'unknown',
  ) {
    const tradeCall = await this.reviewQueueService.promote(id, dto, adminId);
    return { success: true, data: tradeCall };
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a pending review item' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the review item' })
  @ApiOkResponse({ description: 'Updated (REJECTED) review item' })
  @ApiNotFoundResponse({ description: 'Review item not found' })
  @ApiResponse({ status: 400, description: 'Review item is not in PENDING status' })
  @ApiHeader({
    name: 'x-admin-id',
    description: 'Identifier of the admin performing the action',
    required: false,
  })
  async reject(
    @Param('id') id: string,
    @Headers('x-admin-id') adminId = 'unknown',
  ) {
    const item = await this.reviewQueueService.reject(id, adminId);
    return { success: true, data: item };
  }
}
