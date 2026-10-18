import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TradeCall, TradeCallSchema } from './trade-call.schema';
import { TradeCallsService } from './trade-calls.service';
import { TradeCallsController } from './trade-calls.controller';
import { StateMachineService } from './state-machine.service';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TradeCall.name, schema: TradeCallSchema },
    ]),
    EventsModule,
  ],
  providers: [TradeCallsService, StateMachineService],
  controllers: [TradeCallsController],
  exports: [TradeCallsService],
})
export class TradeCallsModule {}
