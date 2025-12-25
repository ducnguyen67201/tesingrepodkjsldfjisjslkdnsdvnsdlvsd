import { HeroSection } from "@/components/hero";
import {
  MetricsTicker,
  ProblemSection,
  CapabilitiesSection,
  AiShowcase,
  ProductOfferingsSection,
  TrustStrip,
  Integrations,
  FaqSection,
  CtaSection,
} from "@/components/sections";

/**
 * Marketing landing page.
 * Flow: Hero → Problem (WHY) → Capabilities (HOW) → AI Demo → Product Offerings → Trust → FAQ → CTA
 */
export default function HomePage() {
  return (
    <>
      <HeroSection />
      <MetricsTicker />
      <ProblemSection />
      <CapabilitiesSection />
      <AiShowcase />
      <ProductOfferingsSection />
      <TrustStrip />
      <Integrations />
      <FaqSection />
      <CtaSection />
    </>
  );
}
