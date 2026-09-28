/**
 * MARKETING COPY FROM THE STITCH DESIGNS — REQUIRES PROJECT-OWNER APPROVAL BEFORE RELEASE.
 *
 * These strings are reproduced verbatim from the approved Batch 01 Stitch screens so the UI
 * matches the design. They are static presentation copy, not data: nothing here is calculated,
 * and no behavior depends on it. Several are factual or commercial claims that no backend data
 * supports yet (delivery time, rating, review count, "$0 first delivery" — a USD pricing claim
 * while V1 is single-market PKR, ADR-0014 §6). Confirm or replace them before launch.
 */
export const welcomeCopy = {
  tagline: 'Instant Food Delivery',
  liveBadge: 'Live nearby',
  speedValue: '22 mins',
  speedLabel: 'Avg delivery',
  ratingValue: '4.9 / 5.0',
  ratingLabel: '100k+ reviews',
  eyebrow: 'Hottest tastes in town',
  headline: 'Craving something',
  headlineAccent: 'delicious?',
  body: 'Explore top-rated local kitchens, curated chef specials, and lightning-fast delivery straight to your table.',
  features: ['No minimums', 'Live GPS tracking', '$0 first delivery'],
} as const;

export const splashCopy = {
  eyebrow: 'Express Delivery',
  body: 'Fast, fresh flavors delivered directly to your doorstep.',
  /** Rotating loading messages from the Stitch splash script (every 1.8 s). */
  loadingMessages: [
    'Initializing QuickBite...',
    'Locating fresh favorites...',
    'Setting up your table...',
  ],
} as const;

export const loginCopy = {
  perkTitle: 'Instant crave protection',
  perkBody: 'Average doorstep dispatch in 24 mins',
} as const;

// ----- Batch 02 -----------------------------------------------------------------------------

export const verifyPhoneCopy = {
  perkTitle: 'Your hot meal is waiting',
  perkBody: 'Verify now to unlock instant $0 delivery perk',
  /**
   * Stitch reads "…with end-to-end encryption". The API uses encrypted connections (HTTPS), not
   * end-to-end encryption, so the claim is reworded to stay accurate (security over UI copy).
   */
  security: 'QuickBite protects your account with encrypted connections.',
  badges: ['FAST SETUP', 'INSTANT ORDER', '100% SECURE'],
} as const;

export const verifyEmailCopy = {
  footer: 'Secured with QuickBite Instant Delivery Pass',
} as const;

export const forgotPasswordCopy = {
  hungryTitle: 'Hungry right now?',
  hungryBody: 'Password resets take less than 60 seconds.',
} as const;
