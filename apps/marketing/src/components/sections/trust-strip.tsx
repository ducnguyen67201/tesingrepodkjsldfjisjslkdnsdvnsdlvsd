import { TRUST_METRICS } from "@/lib/constants";
import { COLORS } from "@/lib/colors";

/**
 * Performance and trust metrics strip.
 * Shows key platform stats in a 4-column grid.
 */
export function TrustStrip() {
  return (
    <section
      className="py-20 px-6 sm:px-8 lg:px-12"
      style={{
        borderTop: `1px solid ${COLORS.border.light}`,
        borderBottom: `1px solid ${COLORS.border.light}`,
        backgroundColor: COLORS.bg.secondary,
      }}
    >
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center divide-x divide-slate-200/50">
          {TRUST_METRICS.map((metric) => (
            <div key={metric.label} className="space-y-2 px-4">
              <div
                className="font-mono text-3xl font-semibold"
                style={{ color: COLORS.ink.primary }}
              >
                {metric.value}
              </div>
              <div
                className="text-[10px] uppercase tracking-widest font-bold"
                style={{ color: COLORS.ink.muted }}
              >
                {metric.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
