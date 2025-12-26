"use client";

import Image from "next/image";
import {
  Activity,
  LineChart,
  Users,
  Workflow,
  BarChart3,
  Bot,
  type LucideIcon,
} from "lucide-react";
import { COLORS } from "@/lib/colors";

/* ─────────────────────────────────────────────────────────────────────────────
   DATA
   ───────────────────────────────────────────────────────────────────────────── */

interface UseCase {
  icon: LucideIcon;
  title: string;
  description: string;
}

const USE_CASES: UseCase[] = [
  {
    icon: Activity,
    title: "Trace AI Apps",
    description:
      "Capture every LLM call, token usage, and latency metric. Debug prompts and monitor model performance in real-time.",
  },
  {
    icon: LineChart,
    title: "Monitor & Alert",
    description:
      "Real-time dashboards with intelligent alerting. Get notified when costs spike, latency increases, or errors occur.",
  },
  {
    icon: Users,
    title: "Scale with Confidence",
    description:
      "High-cardinality queries at any scale. Track usage by customer, region, or any custom dimension without limits.",
  },
];

interface Feature {
  icon: LucideIcon;
  title: string;
}

const FEATURES: Feature[] = [
  { icon: Workflow, title: "Workflows" },
  { icon: BarChart3, title: "Reporting" },
  { icon: Bot, title: "AI Intelligence" },
];

/* ─────────────────────────────────────────────────────────────────────────────
   SUB-COMPONENTS
   ───────────────────────────────────────────────────────────────────────────── */

function UseCaseCard({ useCase }: { useCase: UseCase }) {
  return (
    <div
      className="p-6 rounded-2xl transition-all duration-300 hover:shadow-lg bg-white relative"
      style={{
        border: "1px solid #E2E8F0",
      }}
    >
      {/* Icon */}
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
        style={{
          background: "linear-gradient(135deg, #FEF9E7 0%, #FDE68A 100%)",
        }}
      >
        <useCase.icon
          className="w-6 h-6"
          style={{ color: COLORS.accent.yellowStrong }}
        />
      </div>

      {/* Title */}
      <h3
        className="text-lg font-bold mb-2"
        style={{ color: COLORS.ink.primary }}
      >
        {useCase.title}
      </h3>

      {/* Description */}
      <p
        className="text-sm leading-relaxed"
        style={{ color: COLORS.ink.secondary }}
      >
        {useCase.description}
      </p>
    </div>
  );
}

function FeatureBadge({ feature }: { feature: Feature }) {
  return (
    <div
      className="flex items-center gap-3 px-6 py-3 rounded-xl bg-white transition-all duration-300 hover:shadow-md"
      style={{
        border: "1px solid #E2E8F0",
      }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center"
        style={{
          background: "linear-gradient(135deg, #FEF9E7 0%, #FDE68A 100%)",
        }}
      >
        <feature.icon className="w-4 h-4" style={{ color: COLORS.accent.yellowStrong }} />
      </div>
      <span className="font-semibold" style={{ color: COLORS.ink.primary }}>
        {feature.title}
      </span>
    </div>
  );
}

function CentralLogo() {
  return (
    <div
      className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white shadow-lg"
      style={{
        border: "1px solid #E2E8F0",
      }}
    >
      {/* Logo icon */}
      <Image
        src="/logo.svg"
        alt="Ducsigr"
        width={32}
        height={32}
        className="rounded-lg"
      />
      <span
        className="font-bold text-lg"
        style={{ color: COLORS.accent.yellowStrong }}
      >
        Ducsigr
      </span>
    </div>
  );
}

function WaveDecoration({ side }: { side: "left" | "right" }) {
  const isLeft = side === "left";

  return (
    <svg
      className={`absolute ${isLeft ? "left-0" : "right-0"} top-1/2 -translate-y-1/2 w-32 h-48 opacity-30`}
      viewBox="0 0 100 150"
      fill="none"
      style={{ transform: `translateY(-50%) ${isLeft ? "" : "scaleX(-1)"}` }}
    >
      {Array.from({ length: 12 }).map((_, i) => (
        <path
          key={i}
          d={`M${100 - i * 8} 0 Q${60 - i * 4} 75 ${100 - i * 8} 150`}
          stroke={COLORS.accent.yellowStrong}
          strokeWidth="0.5"
          strokeOpacity={0.3 + i * 0.05}
        />
      ))}
    </svg>
  );
}

function DottedBackground() {
  return (
    <div
      className="absolute inset-0 -z-10"
      style={{
        backgroundImage: `radial-gradient(${COLORS.ink.muted}20 1px, transparent 1px)`,
        backgroundSize: "24px 24px",
      }}
    />
  );
}

function ConnectingLines() {
  return (
    <svg
      className="absolute left-1/2 -translate-x-1/2 w-full h-16 z-0"
      viewBox="0 0 600 60"
      fill="none"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Left card to center */}
      <path
        d="M100 0 L100 30 L300 30"
        stroke={COLORS.accent.yellowStrong}
        strokeWidth="2"
        strokeDasharray="6 4"
        strokeOpacity="0.4"
        fill="none"
      />
      {/* Center card to center */}
      <path
        d="M300 0 L300 30"
        stroke={COLORS.accent.yellowStrong}
        strokeWidth="2"
        strokeDasharray="6 4"
        strokeOpacity="0.4"
        fill="none"
      />
      {/* Right card to center */}
      <path
        d="M500 0 L500 30 L300 30"
        stroke={COLORS.accent.yellowStrong}
        strokeWidth="2"
        strokeDasharray="6 4"
        strokeOpacity="0.4"
        fill="none"
      />
      {/* Center down */}
      <path
        d="M300 30 L300 60"
        stroke={COLORS.accent.yellowStrong}
        strokeWidth="2"
        strokeDasharray="6 4"
        strokeOpacity="0.4"
        fill="none"
      />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
   ───────────────────────────────────────────────────────────────────────────── */

export function ProductOfferingsSection() {
  const renderUseCase = (useCase: UseCase) => (
    <UseCaseCard key={useCase.title} useCase={useCase} />
  );

  const renderFeature = (feature: Feature) => (
    <FeatureBadge key={feature.title} feature={feature} />
  );

  return (
    <section
      id="product-offerings"
      className="py-24 px-6 sm:px-8 lg:px-12 relative overflow-hidden"
      style={{ backgroundColor: COLORS.bg.primary }}
    >
      <DottedBackground />

      <div className="max-w-6xl mx-auto relative">
        {/* Section Header */}
        <div className="text-center mb-12">
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider mb-6"
            style={{
              backgroundColor: "#FEF3C7",
              color: COLORS.accent.yellowStrong,
              border: "1px solid #FDE68A",
            }}
          >
            Product Offerings
          </div>

          <h2
            className="font-display text-4xl md:text-5xl font-bold mb-4"
            style={{ color: COLORS.ink.primary }}
          >
            Choose your use case.
          </h2>
          <h2
            className="font-display text-4xl md:text-5xl font-bold"
            style={{ color: COLORS.accent.yellowStrong }}
          >
            Level with Ducsigr.
          </h2>
        </div>

        {/* Use Cases Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {USE_CASES.map(renderUseCase)}
        </div>

        {/* Connecting Lines Container */}
        <div className="relative h-16 mb-4">
          <ConnectingLines />
        </div>

        {/* Central Logo */}
        <div className="flex justify-center mb-8">
          <CentralLogo />
        </div>

        {/* Connecting Line Down */}
        <div className="flex justify-center mb-4">
          <div
            className="w-0.5 h-8"
            style={{
              background: `repeating-linear-gradient(to bottom, ${COLORS.accent.yellowStrong}66 0, ${COLORS.accent.yellowStrong}66 6px, transparent 6px, transparent 10px)`,
            }}
          />
        </div>

        {/* Unified Platform Section */}
        <div
          className="relative rounded-2xl p-8 mb-8 overflow-hidden"
          style={{
            backgroundColor: COLORS.bg.white,
            border: "1px solid #E2E8F0",
          }}
        >
          <WaveDecoration side="left" />
          <WaveDecoration side="right" />

          <div className="text-center relative z-10">
            <h3
              className="text-2xl md:text-3xl font-bold mb-3"
              style={{ color: COLORS.ink.primary }}
            >
              Unified Observability Platform
            </h3>
            <p
              className="text-base max-w-2xl mx-auto"
              style={{ color: COLORS.ink.secondary }}
            >
              Ducsigr unifies traces, metrics, and AI insights to fuel
              powerful observability across your entire application stack.
            </p>
          </div>
        </div>

        {/* Feature Badges */}
        <div className="flex flex-wrap justify-center gap-4 mb-8">
          {FEATURES.map(renderFeature)}
        </div>

        {/* Connecting Line to Avatars */}
        <div className="flex justify-center mb-6">
          <div
            className="w-0.5 h-8"
            style={{
              background: `repeating-linear-gradient(to bottom, ${COLORS.accent.yellowStrong}66 0, ${COLORS.accent.yellowStrong}66 6px, transparent 6px, transparent 10px)`,
            }}
          />
        </div>

        {/* Team Avatars */}
        <div className="flex justify-center">
          <div className="flex -space-x-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold"
                style={{
                  background: `linear-gradient(135deg, ${COLORS.accent.yellow} 0%, ${COLORS.accent.yellowStrong} 100%)`,
                  border: "2px solid white",
                  color: "white",
                }}
              >
                {String.fromCharCode(64 + i)}
              </div>
            ))}
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold"
              style={{
                backgroundColor: COLORS.bg.white,
                border: "2px solid #E2E8F0",
                color: COLORS.ink.secondary,
              }}
            >
              +99
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
