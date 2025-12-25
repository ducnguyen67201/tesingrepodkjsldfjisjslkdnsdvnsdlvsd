"use client";

import { useState } from "react";
import { COLORS } from "@/lib/colors";

/**
 * Final call-to-action section with email signup.
 */
export function CtaSection() {
  const [email, setEmail] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement email signup
    console.log("Email submitted:", email);
  };

  return (
    <section className="py-32 px-6 text-center relative overflow-hidden">
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
          Join thousands of engineers reducing MTTR with AI-driven
          observability.
        </p>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="eng@company.com"
            className="flex-1 h-12 rounded-lg px-4 shadow-sm transition-all focus:outline-none"
            style={{
              backgroundColor: COLORS.bg.white,
              border: `1px solid ${COLORS.border.light}`,
              color: COLORS.ink.primary,
            }}
            required
          />
          <button type="submit" className="h-12 px-6 btn-primary rounded-lg">
            Get Started
          </button>
        </form>

        <p className="mt-4 text-xs" style={{ color: COLORS.ink.muted }}>
          No credit card required for free tier.
        </p>
      </div>
    </section>
  );
}
