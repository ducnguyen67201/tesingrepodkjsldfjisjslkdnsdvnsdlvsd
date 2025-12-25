"use client";

import Link from "next/link";
import { Activity, ArrowRight } from "lucide-react";

import { NAV_LINKS } from "@/lib/constants";
import { COLORS } from "@/lib/colors";

/**
 * Marketing site navigation with glassmorphism bubble effect (YC style).
 * Fixed position, floating pill shape.
 */
export function MarketingNav() {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 px-4 sm:px-6 lg:px-8 pt-4">
      <nav
        className="max-w-6xl mx-auto h-14 px-4 sm:px-6 flex items-center justify-between rounded-full backdrop-blur-xl bg-white/80 shadow-lg shadow-black/[0.03] border border-white/50"
        style={{
          boxShadow: "0 4px 30px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.05)",
        }}
      >
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{
              background: `linear-gradient(to bottom right, ${COLORS.accent.yellow}, ${COLORS.accent.yellowStrong})`,
              boxShadow: "0 2px 8px rgba(246, 196, 83, 0.3)",
            }}
          >
            <Activity className="w-[18px] h-[18px] text-white" />
          </div>
          <span
            className="font-display font-semibold tracking-tight text-lg hidden sm:block"
            style={{ color: COLORS.ink.primary }}
          >
            CognObserve
          </span>
        </Link>

        {/* Nav Links - Desktop */}
        <div className="hidden md:flex items-center gap-6 text-sm font-medium">
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

        {/* CTA Button */}
        <Link
          href="/demo"
          className="h-9 px-4 rounded-full btn-primary text-sm font-semibold flex items-center gap-2"
        >
          Book a Demo
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </nav>
    </div>
  );
}
