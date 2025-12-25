"use client";

import Link from "next/link";
import { Activity, ArrowRight } from "lucide-react";

import { NAV_LINKS } from "@/lib/constants";
import { COLORS } from "@/lib/colors";

/**
 * Marketing site navigation with glassmorphism effect.
 * Fixed position, shows on scroll.
 */
export function MarketingNav() {
  return (
    <nav className="fixed top-0 w-full z-50 border-b border-[var(--line-0)] backdrop-blur-xl bg-white/60 supports-[backdrop-filter]:bg-white/60">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center border border-white/50"
            style={{
              background: `linear-gradient(to bottom right, ${COLORS.accent.yellow}, ${COLORS.accent.yellowStrong})`,
              boxShadow: "0 4px 14px rgba(246, 196, 83, 0.3)",
            }}
          >
            <Activity className="w-[18px] h-[18px] text-white" />
          </div>
          <span
            className="font-display font-semibold tracking-tight text-lg"
            style={{ color: COLORS.ink.primary }}
          >
            CognObserve
          </span>
        </Link>

        {/* Nav Links - Desktop */}
        <div className="hidden md:flex items-center gap-8 text-sm font-medium">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-[var(--ink-0)]"
              style={{ color: COLORS.ink.secondary }}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* CTA Buttons */}
        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="hidden sm:block text-sm font-medium transition-colors hover:text-[var(--ink-0)]"
            style={{ color: COLORS.ink.secondary }}
          >
            Log in
          </Link>
          <Link
            href="/register"
            className="h-9 px-4 rounded-full btn-primary text-sm font-semibold flex items-center gap-2"
          >
            Start free
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </nav>
  );
}
