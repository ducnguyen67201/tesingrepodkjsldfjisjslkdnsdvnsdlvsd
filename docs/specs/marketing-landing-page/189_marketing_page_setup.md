# Marketing Landing Page - Engineering Spec

## Overview
Build a high-converting, single-page marketing site for an OLTP observability platform. The page should communicate reliability, low overhead, and fast time-to-insight while showcasing "AI-accessory" UI patterns (glassy layers, assistant rail, contextual insights). The page must feel modern and premium without relying on dark-mode-only styling.

## Goals
- Communicate the product value for OLTP observability in the first screen.
- Drive primary CTA conversions (start free, request demo) with clear secondary paths.
- Showcase key capabilities: tracing, metrics, alerts, root-cause guidance, and fast onboarding.
- Present a distinctive glassmorphism aesthetic aligned with an AI-assisted product.
- Achieve strong SEO and performance for acquisition.

## Non-goals
- Building the full app or authenticated flows.
- Writing long-form documentation or blog infrastructure.
- Implementing a complex CMS or content editor.

## Target Audiences
- Engineering leadership: cares about reliability, cost, and risk reduction.
- Platform/SRE engineers: wants deep visibility and fast debug loops.
- Database/backend engineers: focused on OLTP latency, throughput, and anomalies.

## Key Messages
- "Observe every transaction in real time without slowing production."
- "AI-guided insights reduce MTTR for OLTP issues."
- "Low-overhead instrumentation and fast onboarding."
- "Actionable metrics: p50/p95/p99 latency, error rates, and service health."

## Site Map
- `/` Landing page
- `/pricing` Optional, if pricing is public
- `/security` Optional, for trust posture
- `/docs` External or internal link
- `/privacy`, `/terms` Legal pages

## Page Structure (Landing)
1. **Hero**: headline, subhead, dual CTA, animated "glassy" control strip with AI assistant hints.
2. **Problem + Promise**: OLTP pain points and the promise of low-latency observability.
3. **Core Capabilities**: 4-6 feature cards (tracing, metrics, alerts, root cause, SLOs, integrations).
4. **AI-Accessory Panel**: floating assistant rail showing suggested insights and actions.
5. **Product Visual**: hero mock or animated dashboard preview.
6. **Performance Proof**: metrics (e.g. low overhead, fast ingest) with clear footnotes.
7. **Integrations**: SDKs, exporters, and data sources.
8. **Security + Trust**: data handling, encryption, auditability.
9. **FAQ**: short, technical answers.
10. **Final CTA**: strong close with simplified form or buttons.
11. **Footer**: navigation, legal, contact, social.

## Visual Direction (AI-Accessory + Glassmorphism)
### Look and Feel
- Glassmorphism layers over a subtle gradient background.
- High-contrast text and sharp typography for technical credibility.
- Neutral base with electric accent (teal/ice/amber). Avoid purple bias.
- Background atmosphere: soft radial gradients, light noise overlay, faint grid lines.

### Typography
- Headings: `Space Grotesk` (or similar geometric sans).
- Body: `IBM Plex Sans` (or similar technical sans).
- Numbers/metrics: `JetBrains Mono` for stats and telemetry labels.

### Color Tokens (example)
- `INK_950` #0B0F14 (text and deep background)
- `SLATE_900` #131923 (main background)
- `GLASS_200` rgba(255,255,255,0.08) (glass surface)
- `GLASS_300` rgba(255,255,255,0.14)
- `ICE_400` #8ADFE8 (primary accent)
- `AMBER_400` #F4B35A (secondary accent)
- `MINT_300` #8BE3C0 (positive signal)

### Glass Surface Rules
- Use `backdrop-blur` with layered borders (1px semi-transparent).
- Use subtle inner highlight: `inset 0 1px 0 rgba(255,255,255,0.15)`.
- Provide fallback for browsers without `backdrop-filter` (solid semi-transparent).

## Motion and Interaction
- Hero load: staggered fade + upward drift (120-180ms intervals).
- Assistant panel: gentle pulse for the first 3 seconds, then idle.
- Scroll reveal: minimal, subtle; ensure reduced-motion support.
- Avoid heavy parallax; keep motion lightweight for performance.

## Component Inventory
- SiteHeader (logo, nav, CTA, mobile menu)
- HeroSection (title, subhead, CTA row, hero visual)
- MetricsTicker (p50/p95/p99, error rate, throughput)
- FeatureGrid (4-6 cards, glass panels)
- AIInsightRail (floating assistant, prompts, recommendations)
- ProductPreview (static image or short video)
- IntegrationRow (SDKs, exporters, DBs)
- TrustBar (security, compliance statements)
- FAQAccordion
- FinalCTA (button + email capture optional)
- SiteFooter

## Content Guidelines
- Keep copy short and technical but approachable.
- Avoid competitor names or comparisons.
- Use concrete OLTP terms: transactions, latency percentiles, error budget, throughput.
- Provide 2-3 headline variants in content source for A/B testing.

## Technical Approach
### Routing Options
Option A (recommended): Add a marketing route group in `apps/web`.
- `/` renders marketing when unauthenticated; logged-in users redirect to workspace.
- `/app` or `/workspace/*` for authenticated UI.

Option B: Create a separate `apps/marketing` Next.js app.
- Deploy separately; clean separation from auth and app routing.

### Implementation Notes
- Use Next.js App Router, `next/font` with self-hosted fonts.
- Use `@/components/ui` for buttons, cards, and inputs; extend with Tailwind classes.
- Store page content as typed constants for easy edits (no inline JSX strings).
- Use `next/image` for all images and set explicit sizes to prevent layout shift.
- Add `metadata` and `generateMetadata` for SEO.

## Data and Assets
- Provide hero dashboard mock (SVG/PNG) and 1 short looping video (optional).
- Use product screenshots only if they match the AI-accessory aesthetic.
- Keep media under 500KB per asset; use AVIF or WebP.

## SEO and Growth
- Metadata: title, description, OpenGraph, Twitter card.
- JSON-LD: `SoftwareApplication` and `Organization`.
- Structured headings and keyword usage for "OLTP observability" and "transaction monitoring".
- Add tracking hooks for CTA clicks and scroll depth.

## Accessibility
- WCAG AA contrast for text on glass surfaces.
- Keyboard navigation for all interactive elements.
- Reduced motion support via `prefers-reduced-motion`.
- `aria-labels` for nav and assistant panel controls.

## Performance Targets
- LCP < 2.5s, CLS < 0.05, TBT < 200ms on mobile.
- Lighthouse >= 90 for Performance, Accessibility, SEO.
- Avoid heavy JS animation libraries unless required.

## Milestones
1. Content outline and wireframe
2. Visual system and tokens
3. Component build
4. Responsive polish and QA
5. SEO, analytics, and launch

## Acceptance Criteria
- Landing page matches AI-accessory glassmorphism direction.
- Clear CTA paths above the fold and at page end.
- Mobile and desktop layouts are fully responsive.
- Meets performance and accessibility targets.
- No competitor names in copy or comments.

## Open Questions
- Brand name, logo, and tagline?
- Final CTA destination (signup vs demo request)?
- Public pricing or "contact us"?
- Preferred analytics provider and event naming?
