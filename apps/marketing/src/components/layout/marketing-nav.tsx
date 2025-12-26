"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";

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
          <Image
            src="/logo.svg"
            alt="CognObserve"
            width={32}
            height={32}
            className="rounded-lg"
          />
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
