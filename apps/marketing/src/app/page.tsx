import { HeroSection } from "@/components/hero";
import {
  MetricsTicker,
  FeaturesGrid,
  AiShowcase,
  TrustStrip,
  Integrations,
  FaqSection,
  CtaSection,
} from "@/components/sections";

/**
 * Marketing landing page.
 * Assembles all sections in order.
 */
export default function HomePage() {
  return (
    <>
      <HeroSection />
      <MetricsTicker />
      <FeaturesGrid />
      <AiShowcase />
      <TrustStrip />
      <Integrations />
      <FaqSection />
      <CtaSection />
    </>
  );
}
