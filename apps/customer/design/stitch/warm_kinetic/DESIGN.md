---
name: Warm Kinetic
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#5a4136'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#8e7164'
  outline-variant: '#e2bfb0'
  surface-tint: '#a04100'
  primary: '#a04100'
  on-primary: '#ffffff'
  primary-container: '#ff6b00'
  on-primary-container: '#572000'
  inverse-primary: '#ffb693'
  secondary: '#9c4500'
  on-secondary: '#ffffff'
  secondary-container: '#fd7714'
  on-secondary-container: '#5b2500'
  tertiary: '#565e74'
  on-tertiary: '#ffffff'
  tertiary-container: '#9198b1'
  on-tertiary-container: '#293045'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdbcc'
  primary-fixed-dim: '#ffb693'
  on-primary-fixed: '#351000'
  on-primary-fixed-variant: '#7a3000'
  secondary-fixed: '#ffdbca'
  secondary-fixed-dim: '#ffb68e'
  on-secondary-fixed: '#331200'
  on-secondary-fixed-variant: '#773300'
  tertiary-fixed: '#dae2fd'
  tertiary-fixed-dim: '#bec6e0'
  on-tertiary-fixed: '#131b2e'
  on-tertiary-fixed-variant: '#3f465c'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '800'
    lineHeight: 44px
    letterSpacing: -0.03em
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '800'
    lineHeight: 34px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 26px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: -0.01em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 18px
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-mobile: 0.75rem
  margin: 1.5rem
  margin-mobile: 1.25rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system establishes a high-velocity, reliable, and approachable customer onboarding experience for on-demand food delivery. It pairs the speed and urgency of immediate hunger fulfillment with the clarity and trust required for sensitive transactional onboarding (account creation, credential handling, and payment preparation). 

The visual style is rooted in modern functional minimalism infused with warm kinetic accents. It purposefully rejects heavy visual noise, excessive gradients, and skeuomorphic ornament in favor of pristine white surfaces, structured neutral layers, crisp low-contrast borders, and intentional bursts of energetic culinary orange. The emotional response should be immediate relief, appetite excitement, and effortless frictionless progress.

## Colors

The palette leverages a high-contrast, functional hierarchy built for optimal glanceability under direct sunlight and busy mobile scenarios.

- **Primary (`#FF6B00`) & Secondary Accent (`#FA7511`):** Represents appetite, delivery momentum, and key call-to-actions. Reserved exclusively for primary interactive states, active indicators, and high-impact brand touchpoints.
- **Deep Slate & Charcoal (`#0F172A`, `#334155`, `#64748B`):** Establishes an uncompromised typographic hierarchy. `#0F172A` provides solid contrast for display headers and input values; `#334155` commands body copy and labels; `#64748B` anchors hints, placeholders, and secondary meta copy.
- **Pristine Canvas & Tonal Surface Layers (`#FFFFFF`, `#F8FAFC`, `#F1F5F9`):** Canvas grounding is crisp `#FFFFFF` for primary screens with `#F8FAFC` and `#F1F5F9` providing soft structural segmentation for cards, input containers, and segmented controls.
- **Structural Outlines (`#E2E8F0`):** Hairline perimeter borders defining touch boundaries without visual clutter.

## Typography

The type system standardizes on **Plus Jakarta Sans**, offering geometric clarity softened by humanist terminals. This balances technical precision during account registration with a friendly, food-forward personality.

Tight tracking (`-0.02em` to `-0.03em`) on large display headers creates an impactful headline lockup on onboarding welcome cards. Form field labels and action buttons utilize medium-to-semibold weights to ensure fast scanning during entry and validation error states.

## Layout & Spacing

The layout is built around an ergonomic mobile-first 4-column structure scaling to 8 columns on tablets and 12 columns on desktop web views.

- **Screen Safe Zones & Canvas Padding:** Touchscreens use standard horizontal margins of `1.25rem` (20px) to `1.5rem` (24px) to preserve thumb-friendly reach zones.
- **Rhythm & Stacking:** Form fields are grouped in logical 16px (`space-md`) vertical rhythm clusters, with section separations (such as separating inputs from third-party social auth options) stretching to 24px–32px (`space-lg` to `space-xl`).
- **Responsive Handling:** Auth cards on tablet and desktop are capped at a comfortable 440px max-width container, centered both horizontally and vertically over a subdued `#F8FAFC` background.

## Elevation & Depth

Visual depth relies on crisp tonal containment and low-contrast borders rather than heavy drop shadows.

- **Surface Levels:** 
  - Level 0 (Base Canvas): `#FFFFFF` or `#F8FAFC`.
  - Level 1 (Cards, Sheet Drawers, Modals): `#FFFFFF` bounded by a 1px hairline border of `#E2E8F0` and an ultra-diffused ambient shadow: `0 4px 20px -2px rgba(15, 23, 42, 0.05)`.
  - Level 2 (Active Floating States & Tooltips): `0 10px 25px -4px rgba(15, 23, 42, 0.08)`.
  - Level Interactive (Primary Action Button Glow): `0 8px 16px -2px rgba(255, 107, 0, 0.25)`, signaling tactile responsiveness without looking dated.

## Shapes

The shape profile is calibrated for contemporary consumer mobile usability:

- **Cards & Onboarding Panels:** Set at `1rem` (16px) radius, lending structural softness without compromising content area.
- **Interactive Controls (Buttons, Inputs, Selectors):** Set at `0.75rem` (12px), aligning finger touch affordance with soft geometric clarity.
- **Chips, Avatars, Badges, & Social Pills:** Rounded to full pill configurations (`9999px`) to distinguish meta controls from formal text inputs.

## Components

### Buttons
- **Primary:** Background `#FF6B00`, text `#FFFFFF`, height 52px, radius 12px, font `label-lg`. Active tap scale `0.98` with ambient orange shadow.
- **Secondary / Outline:** Background `#FFFFFF`, 1.5px border `#E2E8F0`, text `#0F172A`. Hover/pressed background `#F8FAFC`.
- **Social Auth Buttons (Apple, Google):** Crisp white background, 1px border `#E2E8F0`, icon left-aligned, centered text `#0F172A`, height 50px.

### Input Fields
- Height 52px, radius 12px, border 1.5px `#E2E8F0`, background `#FFFFFF` (or soft `#F8FAFC` in resting state).
- **Focused State:** 1.5px border `#FF6B00` with an outer soft focus ring `rgba(255, 107, 0, 0.15)`.
- **Error State:** Border `#EF4444`, helper copy `#EF4444` using `body-sm`.
- Floating labels or top-aligned labels in `label-sm` (`#334155`).

### Checkboxes & Radio Buttons
- 20px x 20px, 6px radius for checkboxes, full circle for radios.
- Unchecked: 1.5px border `#CBD5E1`.
- Checked: Background `#FF6B00` with crisp `#FFFFFF` icon checkmark.

### Cards & Surface Containers
- 16px corner radius, `#FFFFFF` fill, 1px solid `#E2E8F0` stroke, 16px to 24px internal padding.

### Chips & Segmented Toggles
- Height 36px, radius `9999px`, padding 0 16px. Selected chip uses `#0F172A` fill with `#FFFFFF` text, or `#FFF7ED` fill with `#FF6B00` text for category filters.

### Auth Header & Progress Indicators
- Linear step indicators for multi-stage registration: 4px height, `#FF6B00` active fill, `#E2E8F0` inactive track, 2px rounded caps.