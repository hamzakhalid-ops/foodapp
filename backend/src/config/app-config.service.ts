import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Env } from './env.schema';

/** Typed accessor over validated configuration. Inject this instead of reading process.env. */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get<TKey extends keyof Env>(key: TKey): Env[TKey] {
    return this.config.get(key, { infer: true });
  }

  get isProduction(): boolean {
    return this.get('APP_ENV') === 'production';
  }
}
