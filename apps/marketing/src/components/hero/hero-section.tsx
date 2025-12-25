import { HeroContent } from "./hero-content";
import { HeroVisual } from "./hero-visual";

/**
 * Hero section container with responsive grid layout.
 */
export function HeroSection() {
  return (
    <section className="relative z-10 pt-28 pb-20 lg:pt-36 lg:pb-32 px-6 sm:px-8 lg:px-12">
      <div className="max-w-6xl mx-auto grid lg:grid-cols-12 gap-12 items-center">
        <div className="lg:col-span-7">
          <HeroContent />
        </div>
        <div className="lg:col-span-5">
          <HeroVisual />
        </div>
      </div>
    </section>
  );
}
