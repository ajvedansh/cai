import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { ChannelRegistryService } from './channel-registry.service';
import { CreateChannelDto } from './dto/create-channel.dto';

@ApiTags('channel-registry')
@ApiHeader({ name: 'x-api-key', description: 'API key for authentication', required: true })
@UseGuards(ApiKeyGuard)
@Controller('channels')
export class ChannelRegistryController {
  constructor(private readonly channelRegistryService: ChannelRegistryService) {}

  @Get()
  @ApiOperation({ summary: 'List all registered channels' })
  @ApiResponse({ status: 200, description: 'Array of channel documents' })
  @ApiResponse({ status: 401, description: 'Unauthorized — invalid or missing API key' })
  async findAll() {
    const data = await this.channelRegistryService.findAll();
    return { success: true, data };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single channel by ID' })
  @ApiParam({ name: 'id', type: String, description: 'MongoDB ObjectId of the channel' })
  @ApiResponse({ status: 200, description: 'The channel document' })
  @ApiResponse({ status: 401, description: 'Unauthorized — invalid or missing API key' })
  @ApiResponse({ status: 404, description: 'Channel not found' })
  async findById(@Param('id') id: string) {
    const data = await this.channelRegistryService.findById(id);
    return { success: true, data };
  }

  @Post()
  @ApiOperation({ summary: 'Register a new channel' })
  @ApiResponse({ status: 201, description: 'Channel registered successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized — invalid or missing API key' })
  @ApiResponse({ status: 409, description: 'Channel already registered' })
  async create(@Body() dto: CreateChannelDto) {
    const data = await this.channelRegistryService.create(dto);
    return { success: true, data };
  }

  @Patch(':id/toggle-active')
  @ApiOperation({ summary: 'Toggle active status of a channel' })
  @ApiParam({ name: 'id', type: String, description: 'MongoDB ObjectId of the channel' })
  @ApiResponse({ status: 200, description: 'Channel active status toggled' })
  @ApiResponse({ status: 401, description: 'Unauthorized — invalid or missing API key' })
  @ApiResponse({ status: 404, description: 'Channel not found' })
  async toggleActive(@Param('id') id: string) {
    const data = await this.channelRegistryService.toggleActive(id);
    return { success: true, data };
  }
}
