import { Logger } from '@nestjs/common';
import { type VerificationSender } from './verification-sender';

/**
 * DEVELOPMENT/TEST ONLY adapter, approved by the project owner for Slice 1 while no SMS/email
 * provider is selected.
 *
 * Writes codes and tokens to the local application log so the flows can be exercised locally.
 * Configuration validation refuses `VERIFICATION_DELIVERY=log` in staging and production
 * (src/config/env.schema.ts), and the factory in auth.module.ts re-checks APP_ENV.
 */
export class LogVerificationSender implements VerificationSender {
  private readonly logger = new Logger('DevVerificationDelivery');

  sendPhoneVerificationCode(phone: string, code: string): Promise<void> {
    this.logger.warn(`[DEV ONLY] Phone verification code for ${phone}: ${code}`);
    return Promise.resolve();
  }

  sendEmailVerificationToken(email: string, token: string): Promise<void> {
    this.logger.warn(`[DEV ONLY] Email verification token for ${email}: ${token}`);
    return Promise.resolve();
  }

  sendPasswordResetToken(channel: 'email' | 'phone', target: string, token: string): Promise<void> {
    this.logger.warn(`[DEV ONLY] Password reset token (${channel}) for ${target}: ${token}`);
    return Promise.resolve();
  }
}
