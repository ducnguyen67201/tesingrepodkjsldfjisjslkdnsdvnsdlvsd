import Link from "next/link";
import { PlayCircle, CheckCircle2 } from "lucide-react";

import { HERO_BADGES } from "@/lib/constants";
import { COLORS } from "@/lib/colors";

/**
 * Hero section text content with headline, badges, and CTAs.
 */
export function HeroContent() {
  return (
    <div className="flex flex-col items-start text-left">
      {/* Version Badge */}
      <div
        className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono mb-6 shadow-sm backdrop-blur-sm"
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.6)",
          border: `1px solid ${COLORS.accent.yellowDim}`,
          color: COLORS.accent.yellowStrong,
        }}
      >
        <span className="relative flex h-2 w-2">
          <span
            className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
            style={{ backgroundColor: COLORS.accent.yellowStrong }}
          />
          <span
            className="relative inline-flex rounded-full h-2 w-2"
            style={{ backgroundColor: COLORS.accent.yellowStrong }}
          />
        </span>
        v2.4 Live: AI Root Cause Analysis
      </div>

      {/* Headline */}
      <h1
        className="font-display text-5xl sm:text-6xl lg:text-7xl font-semibold tracking-tight leading-[1.1] mb-6"
        style={{ color: COLORS.ink.primary }}
      >
        Observe every <br />
        <span className="text-gradient-warm">AI call</span> in real time.
      </h1>

      {/* Subheadline */}
      <p
        className="text-lg max-w-xl mb-8 leading-relaxed font-normal"
        style={{ color: COLORS.ink.secondary }}
      >
        Production-grade AI observability with{" "}
        <span className="font-medium" style={{ color: COLORS.ink.primary }}>
          zero overhead
        </span>
        . Get p99 latency insights, distributed tracing, and AI-guided root
        cause analysis without slowing down your application.
      </p>

      {/* CTA Buttons */}
      <div className="flex flex-wrap gap-4 w-full">
        <Link
          href="/register"
          className="h-12 px-8 rounded-lg btn-primary font-semibold flex items-center justify-center"
        >
          Start observing
        </Link>
        <Link
          href="#demo"
          className="h-12 px-8 rounded-lg glass-panel hover:bg-white font-medium flex items-center justify-center gap-2 group"
          style={{ color: COLORS.ink.primary }}
        >
          <PlayCircle
            className="w-[18px] h-[18px] transition-colors"
            style={{ color: COLORS.accent.yellowStrong }}
          />
          Watch demo
        </Link>
      </div>

      {/* Trust Badges */}
      <div
        className="mt-10 flex items-center gap-6 text-sm font-medium"
        style={{ color: COLORS.ink.muted }}
      >
        {HERO_BADGES.map((badge) => (
          <div key={badge.label} className="flex items-center gap-2">
            <CheckCircle2
              className="w-4 h-4"
              style={{ color: COLORS.status.healthy }}
            />
            <span>{badge.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
