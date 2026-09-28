import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ApiException } from '../../common/http/api.exception';
import { AppConfigService } from '../../config/app-config.service';

/**
 * Private object storage (CLAUDE.md §20, API_SPEC §109). Business code depends only on this
 * service; the driver is configuration. Private objects are never publicly addressable — readers
 * get short-lived signed URLs after backend authorization.
 */
@Injectable()
export class StorageService {
  private readonly s3: S3Client | null;
  private readonly localRoot = join(tmpdir(), 'quickbite-storage');

  constructor(private readonly config: AppConfigService) {
    this.s3 =
      config.get('STORAGE_DRIVER') === 's3'
        ? new S3Client({
            region: config.get('STORAGE_REGION'),
            forcePathStyle: config.get('STORAGE_FORCE_PATH_STYLE'),
            ...(config.get('STORAGE_ENDPOINT') ? { endpoint: config.get('STORAGE_ENDPOINT') } : {}),
            ...(config.get('STORAGE_ACCESS_KEY_ID')
              ? {
                  credentials: {
                    accessKeyId: config.get('STORAGE_ACCESS_KEY_ID'),
                    secretAccessKey: config.get('STORAGE_SECRET_ACCESS_KEY'),
                  },
                }
              : {}),
          })
        : null;
  }

  async putPrivate(key: string, body: Buffer, contentType: string): Promise<void> {
    try {
      if (this.s3) {
        await this.s3.send(
          new PutObjectCommand({
            Bucket: this.config.get('STORAGE_BUCKET_PRIVATE'),
            Key: key,
            Body: body,
            ContentType: contentType,
          }),
        );
        return;
      }
      const path = join(this.localRoot, key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, body);
    } catch {
      throw new ApiException(
        HttpStatus.BAD_GATEWAY,
        'INTERNAL_ERROR',
        'The file could not be stored. Please try again.',
      );
    }
  }

  /** Short-lived read URL for an authorized reader. */
  async signedReadUrl(key: string): Promise<string> {
    if (!this.s3) return `file://${join(this.localRoot, key)}`;
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: this.config.get('STORAGE_BUCKET_PRIVATE'), Key: key }),
      { expiresIn: this.config.get('STORAGE_SIGNED_URL_TTL_SECONDS') },
    );
  }
}
