import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChannelEntity, ChannelSchema } from './channel.schema';
import { ChannelRegistryService } from './channel-registry.service';
import { ChannelRegistryController } from './channel-registry.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ChannelEntity.name, schema: ChannelSchema },
    ]),
  ],
  providers: [ChannelRegistryService],
  controllers: [ChannelRegistryController],
  exports: [ChannelRegistryService],
})
export class ChannelRegistryModule {}
