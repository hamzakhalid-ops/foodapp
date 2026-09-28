import { Global, Module, type OnModuleInit } from '@nestjs/common';
import { ScheduledTasks } from '../../infrastructure/scheduler/scheduler';
import { OutboxProcessor } from './outbox.processor';
import { OutboxService } from './outbox.service';

@Global()
@Module({ providers: [OutboxService, OutboxProcessor], exports: [OutboxService, OutboxProcessor] })
export class OutboxModule implements OnModuleInit {
  constructor(
    private readonly tasks: ScheduledTasks,
    private readonly processor: OutboxProcessor,
  ) {}

  onModuleInit(): void {
    this.tasks.register({
      name: 'outbox-dispatch',
      everyMs: 1000,
      run: () => this.processor.processBatch(),
    });
  }
}
