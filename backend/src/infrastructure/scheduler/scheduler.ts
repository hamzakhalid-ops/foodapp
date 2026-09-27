import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { type Job, type Queue } from 'bullmq';

export const SCHEDULER_QUEUE = 'scheduler';

export interface ScheduledTask {
  name: string;
  everyMs: number;
  run: () => Promise<unknown>;
}

/**
 * Registry of recurring worker tasks. Modules register tasks (outbox dispatch, dispatch offer
 * expiry, promotion expiry, settlements); BullMQ job schedulers run them in the worker process.
 * Tasks read PostgreSQL as the source of truth and must be idempotent.
 */
@Injectable()
export class ScheduledTasks {
  private readonly tasks = new Map<string, ScheduledTask>();

  register(task: ScheduledTask): void {
    this.tasks.set(task.name, task);
  }

  all(): ScheduledTask[] {
    return [...this.tasks.values()];
  }

  get(name: string): ScheduledTask | undefined {
    return this.tasks.get(name);
  }
}

@Processor(SCHEDULER_QUEUE, { concurrency: 4 })
export class SchedulerProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(SchedulerProcessor.name);

  constructor(
    private readonly tasks: ScheduledTasks,
    @InjectQueue(SCHEDULER_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    for (const task of this.tasks.all()) {
      await this.queue.upsertJobScheduler(task.name, { every: task.everyMs }, { name: task.name });
    }
    this.logger.log(
      { tasks: this.tasks.all().map((task) => task.name) },
      'Job schedulers registered',
    );
  }

  async process(job: Job): Promise<unknown> {
    const task = this.tasks.get(job.name);
    if (!task) {
      this.logger.warn({ job: job.name }, 'No task registered for scheduled job');
      return null;
    }
    return task.run();
  }
}
