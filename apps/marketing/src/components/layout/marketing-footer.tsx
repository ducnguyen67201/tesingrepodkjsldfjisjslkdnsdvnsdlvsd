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
      className="border-t"
      style={{
        borderColor: COLORS.border.light,
        backgroundColor: "#0F172A",
      }}
    >
      <div className="max-w-6xl mx-auto px-6 sm:px-8 lg:px-12 py-16">
        {/* Main Footer Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-8 lg:gap-12">
          {/* Brand Column */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{
                  background: `linear-gradient(to bottom right, ${COLORS.accent.yellow}, ${COLORS.accent.yellowStrong})`,
                  boxShadow: "0 4px 14px rgba(246, 196, 83, 0.3)",
                }}
              >
                <Activity className="w-4 h-4 text-white" />
              </div>
              <span className="font-display font-semibold text-lg text-white">
                Ducsigr
              </span>
            </Link>
            <p className="text-sm text-slate-400 max-w-xs mb-6">
              Full-stack observability for modern applications. Traces, logs, and metrics—unified.
            </p>

            {/* Social Links */}
            <div className="flex gap-3">
              {SOCIAL_LINKS.map((social) => (
                <Link
                  key={social.name}
                  href={social.href}
                  className="w-9 h-9 rounded-lg flex items-center justify-center bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                  aria-label={social.name}
                >
                  <social.icon className="w-4 h-4" />
                </Link>
              ))}
            </div>
          </div>

          {/* Link Columns */}
          {FOOTER_SECTIONS.map((section) => (
            <div key={section.title}>
              <h4 className="text-sm font-semibold text-white mb-4">
                {section.title}
              </h4>
              <ul className="space-y-3 text-sm">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-slate-400 hover:text-white transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Row */}
      <div className="border-t border-slate-800">
        <div className="max-w-6xl mx-auto px-6 sm:px-8 lg:px-12 py-6 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-xs text-slate-500">
            &copy; {currentYear} Ducsigr Inc. All rights reserved.
          </p>
          <div className="flex items-center gap-6 text-xs text-slate-500">
            <Link href="/privacy" className="hover:text-slate-300 transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-slate-300 transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
