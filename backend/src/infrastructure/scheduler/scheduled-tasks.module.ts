import { Global, Module } from '@nestjs/common';
import { ScheduledTasks } from './scheduler';

/** Task registry, available in both processes; only the worker runs the tasks. */
@Global()
@Module({ providers: [ScheduledTasks], exports: [ScheduledTasks] })
export class ScheduledTasksModule {}
