import { ApiError, ApiTransportError } from '@quickbite/api-client';

/**
 * Maps structured API errors (API_SPEC §11, §13) to user-facing copy. Screens never show raw
 * backend messages; the `requestId` is kept so the user can quote it to support.
 */
export interface AuthErrorMessage {
  message: string;
  /** Server-side field errors from `VALIDATION_ERROR` (`details.fields`), keyed by request field. */
  fields: Record<string, string>;
  requestId?: string;
}

const MESSAGES: Record<string, string> = {
  AUTH_INVALID_CREDENTIALS: 'Incorrect email/phone number or password.',
  AUTH_ACCOUNT_SUSPENDED: 'This account is suspended. Please contact QuickBite support.',
  AUTH_ACCOUNT_DISABLED: 'This account has been deactivated.',
  AUTH_ACCOUNT_ALREADY_EXISTS: 'An account with this email or phone number already exists.',
  RATE_LIMITED: 'Too many attempts. Please wait a few minutes and try again.',
  VALIDATION_ERROR: 'Please check the highlighted details and try again.',
};

const NETWORK_MESSAGE = "Can't reach QuickBite. Check your connection and try again.";
const FALLBACK_MESSAGE = 'Something went wrong. Please try again.';

function stringRecord(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

export function toAuthErrorMessage(error: unknown): AuthErrorMessage {
  if (error instanceof ApiError) {
    const base = error.requestId ? { requestId: error.requestId } : {};
    if (error.code === 'AUTH_PASSWORD_POLICY_VIOLATION') {
      const { minLength, maxLength } = error.details ?? {};
      const message =
        typeof minLength === 'number' && typeof maxLength === 'number'
          ? `Password must be between ${minLength} and ${maxLength} characters.`
          : 'This password does not meet the password requirements.';
      return { ...base, message, fields: { password: message } };
    }
    return {
      ...base,
      message: MESSAGES[error.code] ?? FALLBACK_MESSAGE,
      fields: error.code === 'VALIDATION_ERROR' ? stringRecord(error.details?.fields) : {},
    };
  }
  if (error instanceof ApiTransportError) return { message: NETWORK_MESSAGE, fields: {} };
  return { message: FALLBACK_MESSAGE, fields: {} };
}
