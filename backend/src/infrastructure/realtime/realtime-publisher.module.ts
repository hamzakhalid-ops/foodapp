import { Global, Module } from '@nestjs/common';
import { RealtimePublisher } from './realtime.publisher';

/** Realtime publishing is available to API and worker processes alike. */
@Global()
@Module({ providers: [RealtimePublisher], exports: [RealtimePublisher] })
export class RealtimePublisherModule {}
