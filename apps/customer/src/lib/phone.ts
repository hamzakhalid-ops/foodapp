/**
 * Dial code shown in phone fields. V1 is a single market (APP_CURRENCY PKR, APP_TIMEZONE
 * Asia/Karachi; API_SPEC examples use +92). The launch market is still an open decision
 * (REPOSITORY_CONSISTENCY_REPORT H5), so there is no country picker; the backend accepts any
 * valid E.164 number.
 */
export const DIAL_CODE = { code: '+92', flag: '🇵🇰' } as const;

/** Builds the E.164 number the API expects (API_SPEC §16.1) from the local number entered. */
export function toE164(dialCode: string, localNumber: string): string {
  return `${dialCode}${localNumber.replace(/\D/g, '').replace(/^0+/, '')}`;
}

/** True when the local number has a plausible length once formatting and a leading 0 are removed. */
export function isPlausibleLocalNumber(localNumber: string): boolean {
  return /^\d{6,14}$/.test(localNumber.replace(/\D/g, '').replace(/^0+/, ''));
}
