"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Zap,
  AlertTriangle,
  Search,
  DollarSign,
  Clock,
  GitBranch,
  Users,
  ArrowRight,
  CheckCircle,
  type LucideIcon,
} from "lucide-react";
import { COLORS } from "@/lib/colors";

/* ─────────────────────────────────────────────────────────────────────────────
   DATA
   ───────────────────────────────────────────────────────────────────────────── */

interface UseCase {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  features: string[];
  metrics: { label: string; value: string }[];
  mockup: {
    title: string;
    mainMetric: { label: string; value: string; change?: string };
    bars: { label: string; width: string }[];
    stats: { label: string; value: string }[];
  };
}

const USE_CASES: UseCase[] = [
  {
    id: "ai-llm",
    title: "AI & LLM Applications",
    subtitle: "Full visibility into your AI stack",
    description:
      "Track every LLM call, token usage, and model performance. Debug prompts, compare models, and optimize costs with real-time insights.",
    features: [
      "Token usage tracking per request",
      "Prompt & completion logging",
      "Model latency comparison",
      "Hallucination detection",
      "Cost attribution by feature",
      "A/B testing for prompts",
    ],
    metrics: [
      { label: "Latency reduction", value: "40%" },
      { label: "Cost savings", value: "35%" },
      { label: "Debug time", value: "-60%" },
    ],
    mockup: {
      title: "LATENCY (P99)",
      mainMetric: { label: "Response time", value: "142ms", change: "↑ 12%" },
      bars: [
        { label: "LLM Call", width: "45%" },
        { label: "Retrieval", width: "75%" },
        { label: "Response", width: "90%" },
      ],
      stats: [
        { label: "TOKENS", value: "1.2M" },
        { label: "COST", value: "$24.50" },
        { label: "REQUESTS", value: "8.4K" },
      ],
    },
  },
  {
    id: "microservices",
    title: "Microservices",
    subtitle: "Distributed tracing at scale",
    description:
      "Trace requests across hundreds of services. Automatically correlate spans, identify bottlenecks, and understand complex request flows.",
    features: [
      "Automatic span correlation",
      "Service dependency maps",
      "Latency breakdown by service",
      "Error propagation tracking",
      "Cross-service debugging",
      "Performance regression alerts",
    ],
    metrics: [
      { label: "MTTR reduction", value: "70%" },
      { label: "P99 improvement", value: "45%" },
      { label: "Incidents caught", value: "99.9%" },
    ],
    mockup: {
      title: "SERVICE LATENCY",
      mainMetric: { label: "P99 latency", value: "89ms", change: "↓ 23%" },
      bars: [
        { label: "API Gateway", width: "30%" },
        { label: "Auth Service", width: "50%" },
        { label: "Database", width: "85%" },
      ],
      stats: [
        { label: "SERVICES", value: "24" },
        { label: "TRACES", value: "1.8M" },
        { label: "ERRORS", value: "0.01%" },
      ],
    },
  },
  {
    id: "event-driven",
    title: "Event-Driven Systems",
    subtitle: "Async visibility made simple",
    description:
      "Trace messages through queues, workers, and event buses. Correlate async events with their triggers and downstream effects.",
    features: [
      "Queue message tracing",
      "Worker performance monitoring",
      "Event correlation graphs",
      "Dead letter queue alerts",
      "Consumer lag tracking",
      "Retry pattern analysis",
    ],
    metrics: [
      { label: "Event visibility", value: "100%" },
      { label: "Processing time", value: "-50%" },
      { label: "Failed events", value: "-80%" },
    ],
    mockup: {
      title: "QUEUE HEALTH",
      mainMetric: { label: "Throughput", value: "12.4K/s", change: "↑ 8%" },
      bars: [
        { label: "Orders Queue", width: "60%" },
        { label: "Notifications", width: "40%" },
        { label: "Analytics", width: "80%" },
      ],
      stats: [
        { label: "QUEUES", value: "8" },
        { label: "PROCESSED", value: "2.1M" },
        { label: "DLQ", value: "12" },
      ],
    },
  },
  {
    id: "compliance",
    title: "Compliance & Security",
    subtitle: "Built-in governance",
    description:
      "Automatic PII redaction, audit trails, and data residency controls. Meet SOC 2, GDPR, and HIPAA requirements out of the box.",
    features: [
      "Automatic PII redaction",
      "Complete audit trails",
      "Data residency controls",
      "Role-based access control",
      "Encryption at rest & transit",
      "Compliance reporting",
    ],
    metrics: [
      { label: "PII detected", value: "99.9%" },
      { label: "Audit coverage", value: "100%" },
      { label: "Compliance", value: "-75%" },
    ],
    mockup: {
      title: "SECURITY SCORE",
      mainMetric: { label: "Compliance", value: "98%", change: "↑ 5%" },
      bars: [
        { label: "PII Redacted", width: "95%" },
        { label: "Encrypted", width: "100%" },
        { label: "Audit Trail", width: "100%" },
      ],
      stats: [
        { label: "SCANS", value: "24K" },
        { label: "REDACTED", value: "1.2K" },
        { label: "ALERTS", value: "3" },
      ],
    },
  },
];

interface Benefit {
  icon: LucideIcon;
  title: string;
  description: string;
}

const BENEFITS: Benefit[] = [
  {
    icon: Zap,
    title: "Sub-second Ingestion",
    description: "See traces in real-time as requests flow through your system.",
  },
  {
    icon: Search,
    title: "High-Cardinality Queries",
    description: "Slice by any dimension—customer, region, model—without limits.",
  },
  {
    icon: DollarSign,
    title: "Cost Attribution",
    description: "Know exactly where your AI spend goes, down to the feature.",
  },
  {
    icon: AlertTriangle,
    title: "Smart Alerting",
    description: "AI-powered anomaly detection catches issues before users do.",
  },
  {
    icon: Clock,
    title: "7-Day Retention",
    description: "Full trace history included. Extended retention on paid plans.",
  },
  {
    icon: GitBranch,
    title: "OpenTelemetry Native",
    description: "Zero vendor lock-in. Migrate in minutes with OTLP support.",
  },
];

/* ─────────────────────────────────────────────────────────────────────────────
   SUB-COMPONENTS
   ───────────────────────────────────────────────────────────────────────────── */

function DottedBackground() {
  return (
    <div
      className="absolute inset-0 -z-10"
      style={{
        backgroundImage: `radial-gradient(${COLORS.ink.muted}15 1px, transparent 1px)`,
        backgroundSize: "24px 24px",
      }}
    />
  );
}

interface UseCaseTabProps {
  useCase: UseCase;
  isActive: boolean;
  onClick: () => void;
}

function UseCaseTab({ useCase, isActive, onClick }: UseCaseTabProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-4 rounded-xl transition-all duration-300"
      style={{
        backgroundColor: isActive ? "#FEF9E7" : "transparent",
        border: isActive ? "2px solid #FDE68A" : "2px solid transparent",
      }}
    >
      <h3
        className="font-semibold transition-colors duration-300"
        style={{ color: isActive ? COLORS.ink.primary : COLORS.ink.secondary }}
      >
        {useCase.title}
      </h3>
      {isActive && (
        <p
          className="text-sm mt-1"
          style={{ color: COLORS.accent.yellowStrong }}
        >
          {useCase.subtitle}
        </p>
      )}
    </button>
  );
}

interface UseCaseContentProps {
  useCase: UseCase;
}

function UseCaseContent({ useCase }: UseCaseContentProps) {
  return (
    <div
      className="h-full rounded-2xl p-8 transition-all duration-500"
      style={{
        backgroundColor: "#FEF9E7",
        border: "1px solid #FDE68A",
      }}
    >
      <div className="grid lg:grid-cols-2 gap-8">
        {/* Left - Content */}
        <div>
          {/* Header */}
          <div className="mb-6">
            <h3
              className="text-2xl font-bold mb-2"
              style={{ color: COLORS.ink.primary }}
            >
              {useCase.title}
            </h3>
            <p
              className="text-sm font-medium"
              style={{ color: COLORS.accent.yellowStrong }}
            >
              {useCase.subtitle}
            </p>
          </div>

          {/* Description */}
          <p
            className="text-base leading-relaxed mb-6"
            style={{ color: COLORS.ink.secondary }}
          >
            {useCase.description}
          </p>

          {/* Features */}
          <div className="mb-6">
            <p
              className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: COLORS.accent.yellowStrong }}
            >
              Key Features
            </p>
            <div className="grid grid-cols-2 gap-2">
              {useCase.features.map((feature) => (
                <div key={feature} className="flex items-center gap-2">
                  <CheckCircle
                    className="w-4 h-4 shrink-0"
                    style={{ color: COLORS.accent.yellowStrong }}
                  />
                  <span
                    className="text-sm"
                    style={{ color: COLORS.ink.secondary }}
                  >
                    {feature}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Metrics */}
          <div
            className="rounded-xl p-4"
            style={{
              backgroundColor: COLORS.bg.white,
              border: "1px solid #FDE68A",
            }}
          >
            <p
              className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: COLORS.accent.yellowStrong }}
            >
              Typical Results
            </p>
            <div className="flex gap-6">
              {useCase.metrics.map((metric) => (
                <div key={metric.label}>
                  <div
                    className="text-xl font-bold"
                    style={{ color: COLORS.accent.yellowStrong }}
                  >
                    {metric.value}
                  </div>
                  <div className="text-xs" style={{ color: COLORS.ink.muted }}>
                    {metric.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right - Dashboard Mockup */}
        <div
          className="rounded-xl overflow-hidden"
          style={{
            backgroundColor: COLORS.bg.white,
            border: "1px solid #E2E8F0",
            boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
          }}
        >
          {/* Window Header */}
          <div
            className="px-4 py-3 flex items-center gap-2"
            style={{ borderBottom: "1px solid #E2E8F0" }}
          >
            <div className="w-3 h-3 rounded-full bg-[#E2E8F0]" />
            <div className="w-3 h-3 rounded-full bg-[#E2E8F0]" />
            <div className="w-3 h-3 rounded-full bg-[#E2E8F0]" />
          </div>

          {/* Dashboard Content */}
          <div className="p-5">
            {/* Main Metric */}
            <div className="mb-5">
              <p
                className="text-xs font-semibold uppercase tracking-wider mb-2"
                style={{ color: COLORS.ink.muted }}
              >
                {useCase.mockup.title}
              </p>
              <div className="flex items-baseline gap-3">
                <span
                  className="text-3xl font-bold"
                  style={{ color: COLORS.ink.primary }}
                >
                  {useCase.mockup.mainMetric.value}
                </span>
                {useCase.mockup.mainMetric.change && (
                  <span
                    className="text-sm px-2 py-0.5 rounded"
                    style={{
                      backgroundColor: "#ECFDF5",
                      color: "#059669",
                    }}
                  >
                    {useCase.mockup.mainMetric.change}
                  </span>
                )}
              </div>
            </div>

            {/* Progress Bars */}
            <div className="space-y-3 mb-5">
              {useCase.mockup.bars.map((bar) => (
                <div key={bar.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span style={{ color: COLORS.ink.secondary }}>
                      {bar.label}
                    </span>
                  </div>
                  <div
                    className="h-2 rounded-full overflow-hidden"
                    style={{ backgroundColor: "#F1F5F9" }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: bar.width,
                        background: `linear-gradient(90deg, ${COLORS.accent.yellow} 0%, ${COLORS.accent.yellowStrong} 100%)`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Stats Row */}
            <div
              className="grid grid-cols-3 gap-3 pt-4"
              style={{ borderTop: "1px solid #E2E8F0" }}
            >
              {useCase.mockup.stats.map((stat) => (
                <div
                  key={stat.label}
                  className="text-center p-3 rounded-lg"
                  style={{ backgroundColor: "#F8FAFC" }}
                >
                  <p
                    className="text-xs font-medium mb-1"
                    style={{ color: COLORS.ink.muted }}
                  >
                    {stat.label}
                  </p>
                  <p
                    className="text-lg font-bold"
                    style={{ color: COLORS.ink.primary }}
                  >
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BenefitCard({ benefit }: { benefit: Benefit }) {
  return (
    <div
      className="p-6 rounded-2xl transition-all duration-300 hover:shadow-md"
      style={{
        backgroundColor: COLORS.bg.white,
        border: "1px solid #E2E8F0",
      }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
        style={{
          background: "linear-gradient(135deg, #FEF9E7 0%, #FDE68A 100%)",
        }}
      >
        <benefit.icon className="w-5 h-5" style={{ color: COLORS.accent.yellowStrong }} />
      </div>
      <h4 className="font-semibold mb-2" style={{ color: COLORS.ink.primary }}>
        {benefit.title}
      </h4>
      <p className="text-sm" style={{ color: COLORS.ink.secondary }}>
        {benefit.description}
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN PAGE
   ───────────────────────────────────────────────────────────────────────────── */

export default function UseCasesPage() {
  const [expandedId, setExpandedId] = useState<string | null>("ai-llm");

  const handleToggle = (id: string) => {
    setExpandedId(id);
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.bg.primary }}>
      {/* Hero Section */}
      <section className="relative py-20 md:py-28 px-6 overflow-hidden">
        <DottedBackground />

        {/* Decorative blurs */}
        <div
          className="absolute top-0 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-20 pointer-events-none"
          style={{ backgroundColor: COLORS.accent.yellow }}
        />
        <div
          className="absolute bottom-0 right-1/4 w-64 h-64 rounded-full blur-3xl opacity-15 pointer-events-none"
          style={{ backgroundColor: COLORS.accent.yellow }}
        />

        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider mb-6"
            style={{
              backgroundColor: "#FEF3C7",
              color: COLORS.accent.yellowStrong,
              border: "1px solid #FDE68A",
            }}
          >
            Use Cases
          </div>

          <h1
            className="font-display text-4xl md:text-6xl font-bold mb-6"
            style={{ color: COLORS.ink.primary }}
          >
            Built for every
            <br />
            <span style={{ color: COLORS.accent.yellowStrong }}>modern architecture</span>
          </h1>

          <p
            className="text-lg md:text-xl max-w-2xl mx-auto mb-10"
            style={{ color: COLORS.ink.secondary }}
          >
            Whether you&apos;re building AI applications, scaling microservices, or
            managing event-driven systems—Ducsigr gives you the visibility you need.
          </p>

          {/* Quick links */}
          <div className="flex flex-wrap justify-center gap-3">
            {USE_CASES.map((uc) => (
              <a
                key={uc.id}
                href={`#${uc.id}`}
                className="px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 hover:shadow-md"
                style={{
                  backgroundColor: COLORS.bg.white,
                  border: "1px solid #E2E8F0",
                  color: COLORS.ink.primary,
                }}
              >
                {uc.title}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases - Horizontal Tabs */}
      <section className="py-16 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-[280px_1fr] gap-6">
            {/* Left - Tabs */}
            <div className="space-y-2">
              {USE_CASES.map((useCase) => (
                <UseCaseTab
                  key={useCase.id}
                  useCase={useCase}
                  isActive={expandedId === useCase.id}
                  onClick={() => handleToggle(useCase.id)}
                />
              ))}
            </div>

            {/* Right - Content Panel */}
            <div className="min-h-[500px]">
              {expandedId && (
                <UseCaseContent
                  useCase={USE_CASES.find((uc) => uc.id === expandedId)!}
                />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Grid */}
      <section className="py-20 px-6 relative overflow-hidden">
        <DottedBackground />

        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2
              className="font-display text-3xl md:text-4xl font-bold mb-4"
              style={{ color: COLORS.ink.primary }}
            >
              Why teams choose Ducsigr
            </h2>
            <p className="text-lg" style={{ color: COLORS.ink.secondary }}>
              Everything you need to ship with confidence
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {BENEFITS.map((benefit) => (
              <BenefitCard key={benefit.title} benefit={benefit} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6">
        <div
          className="max-w-4xl mx-auto rounded-3xl p-10 md:p-14 text-center relative overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${COLORS.accent.yellow}20 0%, ${COLORS.accent.yellowStrong}20 100%)`,
            border: "1px solid #FDE68A",
          }}
        >
          {/* Decorative */}
          <div
            className="absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl opacity-30 pointer-events-none"
            style={{ backgroundColor: COLORS.accent.yellow }}
          />

          <div className="relative z-10">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
              style={{
                background: `linear-gradient(135deg, ${COLORS.accent.yellow} 0%, ${COLORS.accent.yellowStrong} 100%)`,
              }}
            >
              <Users className="w-8 h-8 text-white" />
            </div>

            <h2
              className="font-display text-3xl md:text-4xl font-bold mb-4"
              style={{ color: COLORS.ink.primary }}
            >
              Ready to see it in action?
            </h2>

            <p
              className="text-lg mb-8 max-w-xl mx-auto"
              style={{ color: COLORS.ink.secondary }}
            >
              Book a personalized demo and discover how Ducsigr can transform
              your observability stack.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/demo"
                className="inline-flex items-center justify-center gap-2 h-12 px-8 rounded-full font-semibold transition-all duration-200 hover:scale-105"
                style={{
                  background: `linear-gradient(135deg, ${COLORS.accent.yellow} 0%, ${COLORS.accent.yellowStrong} 100%)`,
                  color: COLORS.ink.primary,
                }}
              >
                Book a Demo
                <ArrowRight className="w-4 h-4" />
              </Link>

              <Link
                href="/"
                className="inline-flex items-center justify-center gap-2 h-12 px-8 rounded-full font-semibold transition-all duration-200 hover:shadow-md"
                style={{
                  backgroundColor: COLORS.bg.white,
                  border: "1px solid #E2E8F0",
                  color: COLORS.ink.primary,
                }}
              >
                Back to Home
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
