"use client";

import Link from "next/link";
import { ArrowRight, Database, Network, Code, Server, Cloud } from "lucide-react";
import { COLORS } from "@/lib/colors";
import type { LucideIcon } from "lucide-react";

interface Integration {
  name: string;
  icon: LucideIcon;
  color: string;
}

// Define integrations inline to avoid passing functions across component boundaries
const INTEGRATIONS: Integration[] = [
  { name: "Postgres", icon: Database, color: "#336791" },
  { name: "Redis", icon: Database, color: "#D82C20" },
  { name: "Kubernetes", icon: Network, color: "#326CE5" },
  { name: "Go", icon: Code, color: "#00ADD8" },
  { name: "Node.js", icon: Server, color: "#339933" },
  { name: "AWS", icon: Cloud, color: "#FF9900" },
];

/**
 * Integrations section showing supported tech stack.
 */
export function Integrations() {
  return (
    <section
      id="integrations"
      className="py-24 px-6 relative"
      style={{ backgroundColor: COLORS.bg.primary }}
    >
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <h3
          className="text-center text-xs font-bold tracking-widest uppercase mb-16"
          style={{ color: COLORS.ink.muted }}
        >
          Works seamlessly with your stack
        </h3>

        {/* Integration Logos */}
        <div className="flex flex-wrap justify-center gap-8 md:gap-16 opacity-80 hover:opacity-100 transition-opacity duration-500">
          {INTEGRATIONS.map((integration) => (
            <IntegrationItem key={integration.name} integration={integration} />
          ))}
        </div>

        {/* View All Link */}
        <div className="mt-16 text-center">
          <Link
            href="/integrations"
            className="text-sm font-semibold inline-flex items-center gap-1 transition-colors border-b border-transparent hover:border-current"
            style={{ color: COLORS.ink.primary }}
          >
            View all 50+ integrations
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function IntegrationItem({ integration }: { integration: Integration }) {
  const Icon = integration.icon;

  return (
    <div
      className="flex items-center gap-2 text-xl font-bold transition-colors cursor-default group"
      style={{ color: COLORS.ink.muted }}
    >
      <Icon
        className="w-6 h-6 transition-colors"
        style={{ color: COLORS.ink.muted }}
      />
      <span
        className="transition-colors"
        style={
          {
            "--hover-color": integration.color,
          } as React.CSSProperties
        }
      >
        <style jsx>{`
          span:hover {
            color: var(--hover-color);
          }
        `}</style>
        {integration.name}
      </span>
    </div>
  );
}
