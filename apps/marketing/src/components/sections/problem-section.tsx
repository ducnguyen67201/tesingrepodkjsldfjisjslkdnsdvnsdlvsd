"use client";

import { AlertTriangle, Clock, Search, DollarSign } from "lucide-react";
import { COLORS } from "@/lib/colors";

const PAIN_POINTS = [
  {
    icon: Clock,
    stat: "4.2 hrs",
    label: "Average time to find root cause",
    description: "Engineers waste hours jumping between tools trying to correlate logs, metrics, and traces.",
  },
  {
    icon: Search,
    stat: "73%",
    label: "Issues found by customers first",
    description: "Without proactive monitoring, your users become your error detection system.",
  },
  {
    icon: DollarSign,
    stat: "$5,600",
    label: "Cost per hour of downtime",
    description: "Every minute of latency or outage directly impacts revenue and customer trust.",
  },
];

/**
 * Problem section - WHY you need observability.
 * Highlights pain points before presenting the solution.
 */
export function ProblemSection() {
  return (
    <section className="py-24 px-6 sm:px-8 lg:px-12 relative overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: `linear-gradient(to bottom, ${COLORS.bg.primary}, #FEF9E7)`,
        }}
      />

      <div className="max-w-6xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16 max-w-3xl mx-auto">
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-4"
            style={{
              backgroundColor: "#FEF2F2",
              color: "#DC2626",
              border: "1px solid #FECACA",
            }}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            The Problem
          </div>

          <h2
            className="font-display text-3xl md:text-4xl font-semibold mb-4"
            style={{ color: COLORS.ink.primary }}
          >
            Debugging distributed systems <br />
            shouldn&apos;t feel like detective work
          </h2>

          <p className="text-lg" style={{ color: COLORS.ink.secondary }}>
            Modern AI applications span multiple services, databases, and LLM providers.
            When something breaks, finding the needle in the haystack is painful.
          </p>
        </div>

        {/* Pain Points Grid */}
        <div className="grid md:grid-cols-3 gap-8">
          {PAIN_POINTS.map((point) => (
            <div
              key={point.label}
              className="relative p-6 rounded-2xl"
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.7)",
                border: "1px solid #E2E8F0",
              }}
            >
              {/* Icon */}
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                style={{
                  backgroundColor: "#FEF2F2",
                  border: "1px solid #FECACA",
                }}
              >
                <point.icon className="w-6 h-6 text-red-500" />
              </div>

              {/* Stat */}
              <div
                className="text-4xl font-display font-bold mb-1"
                style={{ color: COLORS.ink.primary }}
              >
                {point.stat}
              </div>

              {/* Label */}
              <div
                className="text-sm font-semibold mb-2"
                style={{ color: COLORS.ink.primary }}
              >
                {point.label}
              </div>

              {/* Description */}
              <p className="text-sm" style={{ color: COLORS.ink.secondary }}>
                {point.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
