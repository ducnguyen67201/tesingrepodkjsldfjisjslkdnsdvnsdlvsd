"use client";

import { Network, Zap, BarChart2, Eye } from "lucide-react";
import { COLORS } from "@/lib/colors";

const CAPABILITIES = [
  {
    icon: Network,
    title: "Unified Telemetry",
    description:
      "Traces, logs, and metrics in one place. Native OTLP support means zero lock-in and seamless migration.",
    color: "#3B82F6",
    bgColor: "#EFF6FF",
    borderColor: "#BFDBFE",
  },
  {
    icon: Eye,
    title: "Real-Time Visibility",
    description:
      "Sub-second ingestion latency. Watch requests flow through your system as they happen.",
    color: "#8B5CF6",
    bgColor: "#F5F3FF",
    borderColor: "#DDD6FE",
  },
  {
    icon: Zap,
    title: "AI-Powered Analysis",
    description:
      "Automatic anomaly detection and root cause suggestions. Fix issues before they escalate.",
    color: COLORS.accent.yellowStrong,
    bgColor: "#FFFBEB",
    borderColor: "#FDE68A",
  },
  {
    icon: BarChart2,
    title: "High-Cardinality Queries",
    description:
      "Slice data by any dimension—customer, region, model, or custom tags. No pre-aggregation needed.",
    color: "#10B981",
    bgColor: "#ECFDF5",
    borderColor: "#A7F3D0",
  },
];

/**
 * Capabilities section - HOW it works (without saying "how").
 * Shows core platform capabilities in a clean grid.
 */
export function CapabilitiesSection() {
  return (
    <section
      id="features"
      className="py-24 px-6 sm:px-8 lg:px-12 relative"
      style={{ backgroundColor: COLORS.bg.white }}
    >
      <div className="max-w-6xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16 max-w-3xl mx-auto">
          <h2
            className="font-display text-3xl md:text-4xl font-semibold mb-4"
            style={{ color: COLORS.ink.primary }}
          >
            Everything you need to ship with confidence
          </h2>
          <p className="text-lg" style={{ color: COLORS.ink.secondary }}>
            Built for engineering teams who demand reliability. From ingestion to
            insight in milliseconds.
          </p>
        </div>

        {/* Capabilities Grid */}
        <div className="grid md:grid-cols-2 gap-6">
          {CAPABILITIES.map((cap) => (
            <div
              key={cap.title}
              className="group p-6 rounded-2xl transition-all duration-300 hover:shadow-lg"
              style={{
                backgroundColor: cap.bgColor,
                border: `1px solid ${cap.borderColor}`,
              }}
            >
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: COLORS.bg.white,
                    border: `1px solid ${cap.borderColor}`,
                  }}
                >
                  <cap.icon className="w-6 h-6" style={{ color: cap.color }} />
                </div>

                {/* Content */}
                <div>
                  <h3
                    className="text-lg font-semibold mb-2"
                    style={{ color: COLORS.ink.primary }}
                  >
                    {cap.title}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: COLORS.ink.secondary }}>
                    {cap.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
