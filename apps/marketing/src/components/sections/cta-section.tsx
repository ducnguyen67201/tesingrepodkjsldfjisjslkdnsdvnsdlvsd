import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { COLORS } from "@/lib/colors";

/**
 * Final call-to-action section with demo booking.
 */
export function CtaSection() {
  return (
    <section className="py-32 px-6 sm:px-8 lg:px-12 text-center relative overflow-hidden">
      {/* Background Gradient */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: `linear-gradient(to bottom, ${COLORS.bg.white}, ${COLORS.bg.secondary})`,
        }}
      />

      {/* Glow Effect */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg h-64 blur-[80px] opacity-40 pointer-events-none"
        style={{ backgroundColor: COLORS.glow.yellow }}
      />

      <div className="max-w-2xl mx-auto relative z-10">
        <h2
          className="font-display text-4xl md:text-5xl font-semibold mb-6 tracking-tight"
          style={{ color: COLORS.ink.primary }}
        >
          Stop debugging in the dark.
        </h2>

        <p className="text-lg mb-10" style={{ color: COLORS.ink.secondary }}>
          See how CognObserve can transform your observability stack.
        </p>

        <Link
          href="/demo"
          className="inline-flex items-center justify-center gap-2 h-14 px-8 rounded-xl font-semibold text-lg transition-all duration-200 hover:scale-105 hover:shadow-lg"
          style={{
            background: `linear-gradient(135deg, ${COLORS.accent.yellow} 0%, ${COLORS.accent.yellowStrong} 100%)`,
            color: COLORS.ink.primary,
          }}
        >
          Book a Demo
          <ArrowRight className="w-5 h-5" />
        </Link>

        <p className="mt-6 text-sm" style={{ color: COLORS.ink.muted }}>
          30-minute call · No commitment required
        </p>
      </div>
    </section>
  );
}
