import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReviewItem, ReviewItemSchema } from './review-item.schema';
import { ReviewQueueService } from './review-queue.service';
import { ReviewQueueController } from './review-queue.controller';
import { TradeCallsModule } from '../trade-calls/trade-calls.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ReviewItem.name, schema: ReviewItemSchema },
    ]),
    TradeCallsModule,
  ],
  providers: [ReviewQueueService],
  controllers: [ReviewQueueController],
  exports: [ReviewQueueService],
})
export class ReviewQueueModule {}
