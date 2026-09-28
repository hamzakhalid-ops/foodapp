import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { CoreModule } from './core.module';
import { SCHEDULER_QUEUE, SchedulerProcessor } from './infrastructure/scheduler/scheduler';

/**
 * Background worker process (ARCHITECTURE §33, DEPLOYMENT_SPEC §8–9): outbox dispatch and
 * recurring tasks registered by domain modules, executed through BullMQ job schedulers.
 */
@Module({
  imports: [CoreModule, BullModule.registerQueue({ name: SCHEDULER_QUEUE })],
  providers: [SchedulerProcessor],
})
export class WorkerModule {}
