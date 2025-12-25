import { TICKER_ITEMS, type TickerStatus } from "@/lib/constants";
import { COLORS } from "@/lib/colors";

const STATUS_COLORS: Record<TickerStatus, string> = {
  healthy: COLORS.status.healthy,
  info: COLORS.status.info,
  warning: COLORS.status.warning,
  muted: COLORS.status.muted,
};

/**
 * Animated metrics ticker strip.
 * Infinitely scrolls left to show live system metrics.
 */
export function MetricsTicker() {
  // Duplicate items for seamless infinite scroll
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS];

  return (
    <div
      className="w-full overflow-hidden py-3 relative z-10"
      style={{
        backgroundColor: COLORS.bg.white,
        borderTop: `1px solid ${COLORS.border.light}`,
        borderBottom: `1px solid ${COLORS.border.light}`,
        boxShadow: "0 4px 20px -10px rgba(0, 0, 0, 0.05)",
      }}
    >
      <div className="flex items-center whitespace-nowrap animate-ticker gap-12 font-mono text-xs font-medium">
        {items.map((item, index) => (
          <span key={`${item.label}-${index}`} className="flex items-center gap-2">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: STATUS_COLORS[item.status] }}
            />
            <span style={{ color: COLORS.ink.muted }}>{item.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
