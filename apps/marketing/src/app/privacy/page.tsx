import Link from "next/link";
import {
  Shield,
  Lock,
  Eye,
  Server,
  ArrowRight,
  CheckCircle,
} from "lucide-react";
import { COLORS } from "@/lib/colors";

const SECURITY_FEATURES = [
  {
    icon: Lock,
    title: "Encryption Everywhere",
    description:
      "All data is encrypted at rest (AES-256) and in transit (TLS 1.3). Your traces and logs are protected at every step.",
  },
  {
    icon: Eye,
    title: "No Hidden Data Use",
    description:
      "Your data stays private and is never used for AI training or any purpose outside your direct business operations.",
  },
  {
    icon: Server,
    title: "Data Residency",
    description:
      "Choose where your data lives. Deploy in US, EU, or your own infrastructure with our self-hosted collector option.",
  },
];

const COMPLIANCE_ITEMS = [
  "Role-based access control",
  "Complete audit trails",
  "Automatic PII redaction",
  "Data retention controls",
  "Encrypted data storage",
  "Secure API authentication",
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.bg.primary }}>
      {/* Hero Section */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          {/* Badge */}
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-8"
            style={{
              backgroundColor: "#ECFDF5",
              color: "#059669",
              border: "1px solid #A7F3D0",
            }}
          >
            <Shield className="w-3.5 h-3.5" />
            Safe & Secure
          </div>

          {/* Headline */}
          <h1
            className="font-display text-4xl md:text-5xl lg:text-6xl font-bold mb-6"
            style={{ color: COLORS.ink.primary }}
          >
            Your{" "}
            <span style={{ color: COLORS.accent.yellowStrong }}>Privacy</span>,
            <br />
            Our Commitment
          </h1>

          <p
            className="text-lg md:text-xl max-w-2xl mb-12"
            style={{ color: COLORS.ink.secondary }}
          >
            CognObserve keeps your data using the same standards trusted by
            global enterprises. Security isn&apos;t a checkbox—it&apos;s built into
            every line of code.
          </p>
        </div>
      </section>

      {/* Main Content Card */}
      <section className="px-6 pb-20">
        <div className="max-w-6xl mx-auto">
          <div
            className="rounded-3xl p-8 md:p-12"
            style={{
              backgroundColor: COLORS.bg.white,
              border: "1px solid #E2E8F0",
              boxShadow: "0 4px 24px rgba(0,0,0,0.04)",
            }}
          >
            <div className="grid lg:grid-cols-2 gap-12">
              {/* Left Column */}
              <div>
                {/* Security Badge */}
                <div className="flex items-center gap-3 mb-8">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: "#FEF9E7", border: "1px solid #FDE68A" }}
                  >
                    <Shield className="w-5 h-5" style={{ color: COLORS.accent.yellowStrong }} />
                  </div>
                  <span
                    className="text-sm font-medium"
                    style={{ color: COLORS.ink.secondary }}
                  >
                    Security-First Architecture
                  </span>
                </div>

                {/* Quote */}
                <blockquote
                  className="text-lg leading-relaxed mb-8 pl-4"
                  style={{
                    color: COLORS.ink.secondary,
                    borderLeft: `3px solid ${COLORS.accent.yellow}`,
                  }}
                >
                  &ldquo;Security isn&apos;t a checkbox, it&apos;s a commitment. Every
                  line of code at CognObserve is written with trust and security
                  in mind.&rdquo;
                </blockquote>

                <p
                  className="text-sm font-semibold"
                  style={{ color: COLORS.ink.primary }}
                >
                  — The CognObserve Team
                </p>
              </div>

              {/* Right Column */}
              <div className="space-y-6">
                {/* No Hidden Data Use Card */}
                <div>
                  <h3
                    className="text-xl font-bold mb-3"
                    style={{ color: COLORS.ink.primary }}
                  >
                    No Hidden Data Use
                  </h3>
                  <p
                    className="text-base mb-4"
                    style={{ color: COLORS.ink.secondary }}
                  >
                    Your data stays private and is never used for AI training or
                    any purpose outside your direct business operations.
                  </p>
                  <Link
                    href="#policy"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-80"
                    style={{
                      backgroundColor: COLORS.ink.primary,
                      color: COLORS.bg.white,
                    }}
                  >
                    Privacy Policy
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>

                {/* Data Storage Highlight Card */}
                <div
                  className="rounded-2xl p-6 relative overflow-hidden"
                  style={{
                    background: `linear-gradient(135deg, ${COLORS.accent.yellow} 0%, ${COLORS.accent.yellowStrong} 100%)`,
                  }}
                >
                  <div className="relative z-10">
                    <p
                      className="text-lg font-semibold leading-relaxed"
                      style={{ color: COLORS.ink.primary }}
                    >
                      You can choose where your data lives—either in our{" "}
                      <span
                        className="px-2 py-0.5 rounded"
                        style={{ backgroundColor: "rgba(255,255,255,0.3)" }}
                      >
                        secure cloud
                      </span>
                      , or{" "}
                      <span
                        className="px-2 py-0.5 rounded"
                        style={{ backgroundColor: "rgba(255,255,255,0.3)" }}
                      >
                        your own storage
                      </span>
                      .
                    </p>
                    <p
                      className="mt-3 text-base"
                      style={{ color: COLORS.ink.primary, opacity: 0.9 }}
                    >
                      Every workspace gets isolated storage with access
                      restricted to your team.
                    </p>
                  </div>

                  {/* Decorative Shield */}
                  <div
                    className="absolute -bottom-4 -right-4 w-24 h-24 opacity-20"
                    style={{ color: COLORS.ink.primary }}
                  >
                    <Shield className="w-full h-full" />
                  </div>
                </div>

                {/* CTA */}
                <div>
                  <p
                    className="text-sm mb-3"
                    style={{ color: COLORS.ink.secondary }}
                  >
                    Ready to build with security baked in from day one?
                  </p>
                  <Link
                    href="/demo"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-80"
                    style={{
                      backgroundColor: COLORS.ink.primary,
                      color: COLORS.bg.white,
                    }}
                  >
                    Get Started
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Security Features */}
      <section className="py-20 px-6" style={{ backgroundColor: COLORS.bg.white }}>
        <div className="max-w-6xl mx-auto">
          <h2
            className="font-display text-3xl md:text-4xl font-bold mb-12 text-center"
            style={{ color: COLORS.ink.primary }}
          >
            Security at Every Layer
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            {SECURITY_FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="p-6 rounded-2xl"
                style={{
                  backgroundColor: COLORS.bg.primary,
                  border: "1px solid #E2E8F0",
                }}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                  style={{
                    background: "linear-gradient(135deg, #FEF9E7 0%, #FDE68A 100%)",
                  }}
                >
                  <feature.icon
                    className="w-6 h-6"
                    style={{ color: COLORS.accent.yellowStrong }}
                  />
                </div>
                <h3
                  className="text-lg font-bold mb-2"
                  style={{ color: COLORS.ink.primary }}
                >
                  {feature.title}
                </h3>
                <p className="text-sm" style={{ color: COLORS.ink.secondary }}>
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Compliance Checklist */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2
            className="font-display text-3xl md:text-4xl font-bold mb-4"
            style={{ color: COLORS.ink.primary }}
          >
            Security by Design
          </h2>
          <p
            className="text-lg mb-12"
            style={{ color: COLORS.ink.secondary }}
          >
            Built with security best practices from day one
          </p>

          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
            {COMPLIANCE_ITEMS.map((item) => (
              <div
                key={item}
                className="flex items-center gap-3 p-4 rounded-xl"
                style={{
                  backgroundColor: COLORS.bg.white,
                  border: "1px solid #E2E8F0",
                }}
              >
                <CheckCircle
                  className="w-5 h-5 shrink-0"
                  style={{ color: "#059669" }}
                />
                <span
                  className="text-sm font-medium"
                  style={{ color: COLORS.ink.primary }}
                >
                  {item}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6">
        <div
          className="max-w-4xl mx-auto rounded-3xl p-10 md:p-14 text-center"
          style={{
            background: `linear-gradient(135deg, ${COLORS.accent.yellow}20 0%, ${COLORS.accent.yellowStrong}20 100%)`,
            border: "1px solid #FDE68A",
          }}
        >
          <h2
            className="font-display text-3xl md:text-4xl font-bold mb-4"
            style={{ color: COLORS.ink.primary }}
          >
            Questions about security?
          </h2>
          <p
            className="text-lg mb-8"
            style={{ color: COLORS.ink.secondary }}
          >
            Our team is happy to walk you through our security practices.
          </p>
          <Link
            href="/demo"
            className="inline-flex items-center justify-center gap-2 h-12 px-8 rounded-xl font-semibold transition-all duration-200 hover:scale-105"
            style={{
              background: `linear-gradient(135deg, ${COLORS.accent.yellow} 0%, ${COLORS.accent.yellowStrong} 100%)`,
              color: COLORS.ink.primary,
            }}
          >
            Talk to Us
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
