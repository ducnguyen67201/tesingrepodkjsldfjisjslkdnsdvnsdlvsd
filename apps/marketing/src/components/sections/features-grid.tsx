"use client";

import {
  Network,
  Zap,
  BarChart2,
  Database,
  ShieldCheck,
  GitMerge,
  type LucideIcon,
} from "lucide-react";

import { COLORS } from "@/lib/colors";
import { FeatureCard } from "./feature-card";

type FeatureColor = "sky" | "yellow" | "green" | "slate";

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
  color: FeatureColor;
}

// Define features inline to avoid passing functions across component boundaries
const FEATURES: Feature[] = [
  {
    icon: Network,
    title: "Distributed Tracing",
    description:
      "End-to-end request visibility across microservices. Auto-instrumentation for Node, Go, Rust, and Python.",
    color: "sky",
  },
  {
    icon: Zap,
    title: "Instant Root Cause",
    description:
      "Our AI engine correlates logs, metrics, and traces to pinpoint the exact line of code causing latency spikes.",
    color: "yellow",
  },
  {
    icon: BarChart2,
    title: "High-Cardinality Metrics",
    description:
      "Slice and dice data by customer ID, region, or any custom tag. No pre-aggregation required.",
    color: "green",
  },
  {
    icon: Database,
    title: "Database Insights",
    description:
      "Query performance analysis, connection pool stats, and lock contention monitoring out of the box.",
    color: "slate",
  },
  {
    icon: ShieldCheck,
    title: "PII Redaction",
    description:
      "Automatic detection and redaction of sensitive data in traces and logs before they leave your infrastructure.",
    color: "slate",
  },
  {
    icon: GitMerge,
    title: "Deploy Markers",
    description:
      "Visualize deployment events on your dashboards to instantly correlate code changes with performance regressions.",
    color: "slate",
  },
];

/**
 * Features section with 6 capability cards in a responsive grid.
 */
export function FeaturesGrid() {
  return (
    <section
      id="features"
      className="relative z-10 py-24 px-6"
      style={{ backgroundColor: COLORS.bg.primary }}
    >
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16 max-w-2xl mx-auto">
          <h2
            className="font-display text-3xl md:text-4xl font-semibold mb-4"
            style={{ color: COLORS.ink.primary }}
          >
            Complete visibility for AI workloads
          </h2>
          <p className="text-lg" style={{ color: COLORS.ink.secondary }}>
            Designed for high-throughput, latency-sensitive systems. We process
            telemetry so you can fix issues faster.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} feature={feature} />
          ))}
        </div>
      </div>
    </section>
  );
}
