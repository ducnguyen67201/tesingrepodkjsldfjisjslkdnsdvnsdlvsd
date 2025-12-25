import { Sparkles } from "lucide-react";
import { COLORS } from "@/lib/colors";

/**
 * Floating AI insight panel that appears next to the dashboard mockup.
 * Shows an example AI-generated insight with action button.
 */
export function AiInsightPanel() {
  return (
    <div
      className="absolute -right-4 top-12 w-64 glass-panel-high p-4 z-20 transform rotate-1 hidden md:block ai-active"
      style={{ borderLeft: `4px solid ${COLORS.accent.yellow}` }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Sparkles
          className="w-3.5 h-3.5"
          style={{ color: COLORS.accent.yellowStrong }}
        />
        <span
          className="text-[10px] font-bold tracking-wide uppercase"
          style={{ color: COLORS.accent.yellowStrong }}
        >
          AI Insight
        </span>
      </div>

      {/* Content */}
      <p
        className="text-xs leading-relaxed mb-3"
        style={{ color: COLORS.ink.secondary }}
      >
        Anomaly detected in{" "}
        <code
          className="px-1 py-0.5 rounded font-mono text-[10px]"
          style={{
            backgroundColor: "#F1F5F9",
            border: "1px solid #E2E8F0",
            color: COLORS.ink.primary,
          }}
        >
          checkout_service
        </code>
        . DB connection pool saturation correlates with p99 spike.
      </p>

      {/* Action Button */}
      <button
        className="w-full py-1.5 rounded-lg text-xs font-semibold transition-colors shadow-sm"
        style={{
          backgroundColor: "#FFFBEB",
          border: "1px solid #FDE68A",
          color: COLORS.accent.yellowStrong,
        }}
      >
        View Root Cause
      </button>
    </div>
  );
}
