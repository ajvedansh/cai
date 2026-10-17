import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RawMessageEntity, RawMessageSchema } from './raw-message.schema';
import { RawMessagesService } from './raw-messages.service';
import { RawMessagesController } from './raw-messages.controller';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RawMessageEntity.name, schema: RawMessageSchema },
    ]),
    QueueModule,
  ],
  providers: [RawMessagesService],
  controllers: [RawMessagesController],
  exports: [RawMessagesService],
})
export class RawMessagesModule {}
