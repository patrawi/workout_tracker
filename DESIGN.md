---
name: Frictionless
description: Personal AI-powered workout tracker. Log in 30 seconds, review when ready.
colors:
  emerald-primary: "oklch(0.72 0.19 160)"
  emerald-mid: "oklch(0.65 0.22 160)"
  emerald-deep: "oklch(0.55 0.2 160)"
  cyan-secondary: "oklch(0.7 0.18 195)"
  purple-tertiary: "oklch(0.6 0.25 290)"
  amber-chart: "oklch(0.65 0.22 55)"
  rose-chart: "oklch(0.65 0.2 330)"
  destructive: "oklch(0.55 0.2 25)"
  surface-50: "oklch(0.15 0.01 260)"
  surface-100: "oklch(0.18 0.012 260)"
  surface-200: "oklch(0.22 0.015 260)"
  surface-300: "oklch(0.28 0.015 260)"
  surface-400: "oklch(0.38 0.015 260)"
  foreground: "oklch(0.92 0.01 260)"
  foreground-muted: "oklch(0.55 0.01 260)"
  dark-on-primary: "oklch(0.13 0.01 260)"
typography:
  display:
    fontFamily: "Inter, SF Pro Display, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 4vw, 2.25rem)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Inter, SF Pro Display, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Inter, SF Pro Display, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Inter, SF Pro Display, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Inter, SF Pro Display, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.01em"
rounded:
  xs: "3px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.emerald-mid}"
    textColor: "{colors.dark-on-primary}"
    rounded: "{rounded.md}"
    padding: "14px 28px"
  button-primary-hover:
    backgroundColor: "{colors.emerald-primary}"
    textColor: "{colors.dark-on-primary}"
  glass-card:
    backgroundColor: "{colors.surface-100}"
    rounded: "{rounded.lg}"
  glass-input:
    backgroundColor: "{colors.surface-50}"
    rounded: "{rounded.md}"
  glass-input-focus:
    backgroundColor: "{colors.surface-50}"
    textColor: "{colors.foreground}"
  tag-pill:
    backgroundColor: "{colors.emerald-mid}"
    textColor: "{colors.emerald-primary}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
---

# Design System: Frictionless

## 1. Overview

**Creative North Star: "The Instrument"**

Frictionless is built for one person, in one context: standing in a gym, heart still elevated, phone in hand, wanting to log and close. The interface is not meant to be admired. It is meant to be used without friction, without thought, without hesitation. Every surface decision flows from that moment.

The palette is Deep Void Blue: blue-tinted dark neutrals that recede completely, pulling visual attention toward data. The single accent, Calibrated Emerald, is used precisely where action is required or status is meaningful. It does not appear decoratively. The blur-depth elevation system means depth is felt through glass, not cast through shadow. The whole system reads as dense, contained, calibrated — like the display of an instrument that cost too much to be ugly.

The system rejects everything that competes with its data: the cluttered calorie-counter energy of MyFitnessPal, the social-validation noise of Strava, the big-number hero clichés of SaaS dashboards, and the neon visual overload of cyberpunk interfaces. If it looks like a wellness app or a fitness startup's landing page, it has failed.

**Key Characteristics:**
- Dark-only. Not a mode, not a preference — a fixed decision for low-ambient, post-exertion use.
- One accent. Emerald appears on primary actions, active states, and meaningful data signals only.
- Glass depth. Blur and semi-transparency replace shadow stacking. Surfaces lift by being translucent, not elevated.
- Tabular data density. Numbers sit in `tabular-nums`, weighted heavier than surrounding prose.
- Expert-facing. No onboarding patterns, no tooltips on established UI, no confirmation theater.


## 2. Colors: The Deep Void Blue Palette

Blue-tinted neutrals drop to near-black; a single emerald accent carries all interactive meaning.

### Primary
- **Calibrated Emerald** (`oklch(0.72 0.19 160)`): The primary action color. Used on the submit button, active nav state, focus rings, chart-1, heatmap intensity-4, and tag-pill borders. Its rarity is its meaning: when emerald appears, the user should act or look.
- **Emerald Mid** (`oklch(0.65 0.22 160)`): The saturated base for `.btn-primary` gradient and heatmap intensity-3. Slightly more saturated than primary; used as the gradient origin.
- **Emerald Deep** (`oklch(0.55 0.2 160)`): Pressed state, disabled-adjacent, and heatmap intensity-2 hover. The same hue in retreat.

### Secondary
- **Instrument Cyan** (`oklch(0.7 0.18 195)`): Used as chart-2 and the `.btn-primary` gradient target. Pushes the button gradient cool without leaving the instrument family. Never used alone as a standalone action color.

### Tertiary
- **Spectral Purple** (`oklch(0.6 0.25 290)`): chart-3 and rest-day heatmap cells. Semantically distinct from the workout emerald: when purple appears on the heatmap, it means rest, not effort.
- **Amber Signal** (`oklch(0.65 0.22 55)`): chart-4. Warm outlier in a cool palette. Visible under low-ambient light.
- **Rose Trace** (`oklch(0.65 0.2 330)`): chart-5. Used only in multi-series charts needing a fifth lane.
- **Destructive Red** (`oklch(0.55 0.2 25)`): Delete actions and error states. Always used sparingly. Never used as a decorative red.

### Neutral
- **Surface Base** (`oklch(0.15 0.01 260)`): Page background. The deepest surface.
- **Surface Card** (`oklch(0.18 0.012 260)`): Glass card background at 40% opacity. Appears lighter than the base through blur.
- **Surface Raised** (`oklch(0.22 0.015 260)`): Secondary backgrounds, muted surfaces, select options.
- **Surface Border** (`oklch(0.28 0.015 260)`): Borders and input strokes at rest.
- **Surface Mid** (`oklch(0.38 0.015 260)`): Hover states, elevated borders, active outlines at rest.
- **Foreground** (`oklch(0.92 0.01 260)`): All primary text. Slightly blue-tinted white — never pure white.
- **Foreground Muted** (`oklch(0.55 0.01 260)`): Labels, captions, secondary descriptive text. Minimum 3:1 against Surface Card.
- **Dark on Primary** (`oklch(0.13 0.01 260)`): Text placed on emerald buttons. Deep enough to pass contrast against the saturated accent.

**The One Accent Rule.** Calibrated Emerald is the only interactive accent in the system. It is never used decoratively — no emerald dividers, no emerald headings, no emerald icons that don't signal actionability or status. When in doubt, the element should not be emerald.

**The Blue-Tint Rule.** Every neutral carries hue 260 at chroma 0.01–0.015. Pure gray (`oklch(L 0 0)`) is prohibited. The tint ties the entire surface family together and reads as intentional under low-ambient light rather than desaturated by accident.


## 3. Typography

**Display / Body Font:** Inter (with SF Pro Display, system-ui, and sans-serif fallbacks). One family, full stack.

**Character:** Inter at 400/600/700. Tight letter-spacing at display sizes, tabular numerals on all data values. No decorative serifs, no display cuts, no mono body text. The hierarchy is carried entirely by weight and size contrast — the type feels precise without feeling cold.

### Hierarchy
- **Display** (700, clamp(1.75rem → 2.25rem), lh 1.1, ls −0.02em): Page titles and primary headings. Used once per page surface.
- **Headline** (600, 1.25rem, lh 1.3, ls −0.01em): Section heads, card titles, named exercise groups.
- **Title** (600, 1rem, lh 1.4): Sub-section labels, form field heads, modal titles.
- **Body** (400, 0.9375rem / 15px, lh 1.6): All prose, workout notes, nutrition descriptions. Max line length 65–75ch.
- **Label** (500, 0.75rem, lh 1.4, ls +0.01em): Tags, axis labels, kbd hints, metadata. Never used for body copy.

**The Tabular Rule.** Every numeric value that changes or can be compared (weights, reps, calories, macro grams, dates, percentages) uses `font-variant-numeric: tabular-nums`. This prevents layout shift and makes scanning a column of numbers effortless.

**The Weight-Contrast Rule.** Display and Headline are always weight 700 or 600. Body and Label are always 400 or 500. Adjacent typography steps must differ by at least one weight increment. Never two consecutive steps at the same weight — hierarchy is earned, not implied by size alone.


## 4. Elevation

This system uses blur-depth, not shadow stacking. Surfaces do not cast shadows at rest. Depth is created through translucency and backdrop blur: a surface elevated above the page background becomes a lens, slightly brightening and blurring what's beneath it. The blur IS the elevation.

Two glass variants exist. `.glass-card` (blur 24px, saturate 1.2) is the standard container: used for workout log sections, analytics panels, profile cards. `.glass-input` (blur 16px, saturate 1.2) is the recessed form variant: used for text inputs, textareas, and select fields. It sits below card level, not above.

### Shadow Vocabulary
- **Glass ambient** (`inset 0 1px 0 0 oklch(1 0 0 / 0.05), 0 8px 32px 0 oklch(0 0 0 / 0.3)`): Applied to `.glass-card`. The top inset highlight simulates a light source above. The outer shadow grounds the panel.
- **Input inset** (`inset 0 2px 4px 0 oklch(0 0 0 / 0.2), inset 0 1px 0 0 oklch(1 0 0 / 0.05)`): Applied to `.glass-input`. The inset shadow reads as a recessed field below the card surface.
- **Button glow** (`0 8px 30px oklch(0.65 0.22 160 / 0.3)`): Appears on `.btn-primary:hover` only. Not present at rest. The glow confirms action availability — it is a state response, not a decoration.
- **Heatmap cell glow** (`0 0 6px oklch(0.72 0.22 160 / 0.3)`): Applied only to intensity-4 cells. The highest workout load glows faintly; lower intensities do not.

**The Blur-First Rule.** If you feel the urge to add a drop shadow to an element that isn't a glass panel or an active button, add translucency and blur instead. A new shadow layer is almost never the right answer.

**The Flat-at-Rest Rule.** Interactive elements carry no elevation at rest. Hover states introduce the glow. This means a button that is lit is a button that the cursor is over — the lighting is a cursor response, not a cosmetic default.


## 5. Components

### Buttons

Confident and blunt. No border treatments, no ghost variants as the primary call to action.

- **Shape:** Gently curved edges (12px radius, `{rounded.md}`)
- **Primary:** Emerald-to-cyan gradient (`oklch(0.65 0.22 160)` → `oklch(0.7 0.18 195)`), dark text (`oklch(0.13 0.01 260)`), padding 14px 24px, font-weight 600
- **Hover:** Lift 1px (`translateY(-1px)`), button glow shadow (`0 8px 30px oklch(0.65 0.22 160 / 0.3)`), 0.15s ease transition
- **Active:** Returns to `translateY(0)`, no glow
- **Disabled:** 50% opacity, `cursor: not-allowed`, no hover lift
- **Ghost / Secondary:** No formal class — use Tailwind ghost variants with `text-[var(--foreground)]` and `border-[var(--border)]`. No accent color, no gradient.

### Cards / Containers

The backbone of every page. Glass is the surface; blur is the material.

- **Corner Style:** Rounded (16px radius, `{rounded.lg}`)
- **Background:** `oklch(0.18 0.012 260 / 0.4)` — semi-transparent surface-100 at 40%
- **Backdrop:** `blur(24px) saturate(1.2)`
- **Border:** Full perimeter 1px at `oklch(0.3 0.015 260 / 0.5)`, top edge 1px at `oklch(0.4 0.015 260 / 0.6)` — the top highlight simulates the light source
- **Shadow:** `inset 0 1px 0 0 oklch(1 0 0 / 0.05), 0 8px 32px 0 oklch(0 0 0 / 0.3)`
- **Internal Padding:** `{spacing.lg}` (24px) on wide viewports, `{spacing.md}` (16px) on mobile

**The No-Nested-Glass Rule.** Glass cards are not placed inside other glass cards. A `.glass-input` inside a `.glass-card` is correct — an input field recesses within a container. A `.glass-card` inside a `.glass-card` is always wrong.

### Inputs / Fields

Recessed below the card surface. Inputs are voids, not panels.

- **Style:** `oklch(0.14 0.01 260 / 0.5)` background, blur 16px, 12px radius (`{rounded.md}`), border `oklch(0.3 0.015 260 / 0.4)`
- **Focus:** Emerald border (`var(--color-accent-400)`), 3px emerald glow ring at 15% opacity (`oklch(0.65 0.22 160 / 0.15)`), no outline
- **Error:** Red-tinted background `oklch(0.55 0.2 25 / 0.1)` with red border. Never a side-stripe; always a full perimeter treatment.
- **Disabled:** No specific treatment; use 50% opacity and `cursor: not-allowed` inline.

### Navigation

Minimal sticky header, no sidebar, no drawer on desktop.

- **Container:** `backdrop-blur-xl`, border-bottom `oklch(0.3 0.015 260 / 0.3)` at scroll. Transparent at top.
- **Logo:** Emoji glyph + "Frictionless" wordmark. On hover: soft emerald glow (`text-shadow`-style filter, not glow on the container).
- **Nav links:** Body weight (400), muted foreground at rest, foreground on hover, transition 0.15s. Active route: emerald foreground with emerald dot indicator.
- **Mobile:** Bottom navigation expected as the primary mobile pattern given the 30-second-log use case. Top header collapses to logo + hamburger if needed.

### Tag Pills

Compact semantic labels for workout type, activity category, and exercise tags.

- **Style:** Full-radius capsule (`{rounded.full}`), 4px/10px padding, 0.75rem text
- **Background:** Emerald tint `oklch(0.65 0.22 160 / 0.12)`, text `var(--color-accent-400)`, border `oklch(0.65 0.22 160 / 0.2)`
- **Rule:** Tag pills use only the emerald family. Non-emerald pills mean a different semantic family (rest = purple family; error = red family).

### Heatmap Calendar

Signature component. The home screen's primary data visualization and the fastest way to see training consistency at a glance.

- **Cell size:** 13×13px, `{rounded.xs}` (3px radius). Tight grid, compact density.
- **Intensity scale (0–4):** oklch stepped from `oklch(0.2 0.012 260)` (empty) through `oklch(0.35 0.12 160)` → `oklch(0.48 0.16 160)` → `oklch(0.6 0.2 160)` → `oklch(0.72 0.22 160)` (peak). The darkest filled cell glows.
- **Rest day:** `oklch(0.45 0.15 280)` — purple family, visually distinct from workout intensity.
- **Hover:** 2px outline offset, no background change. Cursor: pointer.
- **Spacing:** `gap-[3px]` between cells. Week-column labels above in label typography, month markers below.

### Stat Values

Inline display pattern for numeric data in cards, analytics KPIs, and profile metrics.

- **Style:** `font-variant-numeric: tabular-nums`, weight 700, size 1.25rem, color `oklch(0.95 0.01 260)` (slightly brighter than base foreground)
- **Supporting label:** Label typography (0.75rem, weight 500), muted foreground. Always below or trailing the value, never above.
- **Rule:** Stat values never appear in a "big number + small label" SaaS hero layout. They live in context — inside a card that also shows the exercise name, the date range, or the chart it summarizes.


## 6. Do's and Don'ts

### Do:
- **Do** use `oklch` for all color values. The palette is defined in OKLCH; hex approximations may be used in the sidecar's `colorMeta` for tooling compatibility but OKLCH is the source of truth.
- **Do** apply `font-variant-numeric: tabular-nums` to every numeric value that can change or be compared, including workout weights, reps, calories, and dates.
- **Do** maintain the top-edge border highlight (`border-top: 1px solid oklch(0.4 0.015 260 / 0.6)`) on all glass surfaces. It is the simulated light source — without it, the glass reads as flat tinting.
- **Do** make tap targets a minimum 44×44px on all interactive elements. This app is used during physical activity.
- **Do** use `font-variant-numeric: tabular-nums` and weight 700 for primary stat values, and weight 400 for surrounding context. Data should visually dominate its label.
- **Do** fade out the header's border-bottom at the page top and reveal it on scroll. The header should feel embedded in the content at top, distinct at scroll.
- **Do** use the emerald-to-cyan gradient exclusively on `.btn-primary`. No other element uses this gradient.
- **Do** use full-perimeter borders on error states. Red is a perimeter treatment, never a side-stripe.
- **Do** use `reduced-motion` guards on all keyframe animations (`@media (prefers-reduced-motion: reduce)`). Already implemented; maintain on all new additions.

### Don't:
- **Don't** add a light mode. There is no light mode. This is not a preference setting. The dark theme is the product.
- **Don't** add decorative emerald. Calibrated Emerald is an interactive signal. If an element using emerald is not a primary action, an active state, or a meaningful data value, remove it.
- **Don't** nest glass cards inside glass cards. `.glass-card > .glass-card` is always structural confusion. `.glass-card > .glass-input` is correct.
- **Don't** use gradient text (`background-clip: text`). Every text color in this system is a solid OKLCH value. Gradient text is decorative and fails against a glass surface.
- **Don't** use `border-left` or `border-right` greater than 1px as a colored accent stripe on cards, callouts, or list items. Use full-perimeter borders, background tints, or leading icons instead.
- **Don't** create hero-metric layouts: big number, small label, gradient accent, supporting stats. Stat values live in context inside named containers, not isolated in a hero zone.
- **Don't** make the interface feel like MyFitnessPal (cluttered chrome, aggressive contrast, data buried under UI), Strava (gamification, social signals, orange urgency), or any SaaS dashboard with identical card grids and progress rings for their own sake.
- **Don't** add neon glows to surfaces or decorative elements. The only glow in the system is the button hover glow and the intensity-4 heatmap cell glow. Both are state-driven responses, not ambient decoration.
- **Don't** use `#000` or `#fff` anywhere. The darkest value is `oklch(0.13 0.01 260)`; the lightest text is `oklch(0.92 0.01 260)`. Tinted extremes always.
- **Don't** add animations to CSS layout properties (width, height, padding, margin). Animate `transform` and `opacity` only.
- **Don't** add confirmation dialogs, tooltips, or onboarding overlays for actions a daily user knows. Trust familiarity. The 30-second log must stay 30 seconds.
