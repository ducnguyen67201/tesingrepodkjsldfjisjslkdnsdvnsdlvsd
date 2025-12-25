import Link from "next/link";
import { Activity } from "lucide-react";

import { FOOTER_SECTIONS, SOCIAL_LINKS } from "@/lib/constants";
import { COLORS } from "@/lib/colors";

/**
 * Marketing site footer with link columns and social icons.
 */
export function MarketingFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer
      className="border-t pt-16 pb-8 px-6"
      style={{
        borderColor: COLORS.border.light,
        backgroundColor: COLORS.bg.white,
      }}
    >
      <div className="max-w-7xl mx-auto">
        {/* Main Footer Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-16">
          {/* Brand Column */}
          <div className="col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <div
                className="w-6 h-6 rounded flex items-center justify-center"
                style={{
                  background: `linear-gradient(to bottom right, ${COLORS.accent.yellow}, ${COLORS.accent.yellowStrong})`,
                  boxShadow: "0 2px 8px rgba(246, 196, 83, 0.3)",
                }}
              >
                <Activity className="w-3.5 h-3.5 text-white" />
              </div>
              <span
                className="font-display font-semibold"
                style={{ color: COLORS.ink.primary }}
              >
                CognObserve
              </span>
            </Link>
            <p
              className="text-sm max-w-xs"
              style={{ color: COLORS.ink.secondary }}
            >
              The observability platform built for modern AI workloads.
            </p>
          </div>

          {/* Link Columns */}
          {FOOTER_SECTIONS.map((section) => (
            <div key={section.title}>
              <h4
                className="text-sm font-semibold mb-4"
                style={{ color: COLORS.ink.primary }}
              >
                {section.title}
              </h4>
              <ul className="space-y-2 text-sm">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="transition-colors hover:text-[var(--ink-0)]"
                      style={{ color: COLORS.ink.secondary }}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom Row */}
        <div
          className="flex flex-col md:flex-row justify-between items-center pt-8 border-t text-xs"
          style={{
            borderColor: COLORS.border.light,
            color: COLORS.ink.muted,
          }}
        >
          <p>&copy; {currentYear} CognObserve Inc. All rights reserved.</p>

          {/* Social Links */}
          <div className="flex gap-4 mt-4 md:mt-0">
            {SOCIAL_LINKS.map((social) => (
              <Link
                key={social.name}
                href={social.href}
                className="transition-colors hover:text-[var(--ink-0)]"
                aria-label={social.name}
              >
                <social.icon className="w-4 h-4" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
