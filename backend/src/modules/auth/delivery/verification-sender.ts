/**
 * Delivery boundary for verification codes and reset tokens (CLAUDE.md §20).
 *
 * Business logic depends only on this interface. Real SMS/email providers are plugged in behind
 * it once selected (REPOSITORY_CONSISTENCY_REPORT C2). Implementations are called only AFTER the
 * database transaction commits — never inside it (CLAUDE.md §9).
 */
export interface VerificationSender {
  sendPhoneVerificationCode(phone: string, code: string): Promise<void>;
  sendEmailVerificationToken(email: string, token: string): Promise<void>;
  sendPasswordResetToken(channel: 'email' | 'phone', target: string, token: string): Promise<void>;
}

export const VERIFICATION_SENDER = Symbol('VERIFICATION_SENDER');
