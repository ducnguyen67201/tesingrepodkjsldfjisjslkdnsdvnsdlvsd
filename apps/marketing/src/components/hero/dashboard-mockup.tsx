import { AlertCircle } from "lucide-react";
import { COLORS } from "@/lib/colors";

/**
 * Animated dashboard mockup card for the hero section.
 * Shows latency metrics, charts, and alerts.
 */
export function DashboardMockup() {
  return (
    <div className="relative w-full aspect-square md:aspect-[4/3] glass-panel-high overflow-hidden z-10 animate-float ring-1 ring-black/5">
      {/* Window Header */}
      <div
        className="h-10 border-b flex items-center px-4 gap-2 backdrop-blur-md"
        style={{
          borderColor: COLORS.border.light,
          backgroundColor: "rgba(255, 255, 255, 0.5)",
        }}
      >
        <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
        <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
        <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
      </div>

      {/* Body */}
      <div
        className="p-6 grid grid-cols-3 gap-4 h-full"
        style={{ backgroundColor: "rgba(255, 255, 255, 0.4)" }}
      >
        {/* Chart Area */}
        <div className="col-span-2 flex flex-col gap-4">
          {/* Metrics Header */}
          <div className="flex justify-between items-end">
            <div>
              <div
                className="text-[10px] tracking-wider font-mono font-bold mb-1 uppercase"
                style={{ color: COLORS.ink.muted }}
              >
                Latency (P99)
              </div>
              <div
                className="text-2xl font-mono font-semibold"
                style={{ color: COLORS.ink.primary }}
              >
                142ms{" "}
                <span
                  className="text-sm ml-2 px-1.5 rounded"
                  style={{
                    color: COLORS.accent.yellowStrong,
                    backgroundColor: "#FEF3C7",
                  }}
                >
                  ↑ 12%
                </span>
              </div>
            </div>

            {/* Mini Bar Chart */}
            <div className="flex gap-1 h-10 items-end">
              <div className="w-2.5 bg-slate-200 h-4 rounded-t-sm" />
              <div className="w-2.5 bg-slate-200 h-6 rounded-t-sm" />
              <div className="w-2.5 bg-slate-200 h-3 rounded-t-sm" />
              <div
                className="w-2.5 h-10 rounded-t-sm animate-pulse"
                style={{
                  backgroundColor: COLORS.accent.yellowStrong,
                  boxShadow: `0 0 10px ${COLORS.glow.yellow}`,
                }}
              />
              <div className="w-2.5 bg-slate-200 h-5 rounded-t-sm" />
            </div>
          </div>

          {/* Trace Lines */}
          <div className="space-y-3 mt-4">
            <TraceBar width="75%" color={COLORS.feature.sky.bg} />
            <TraceBar width="50%" color="#F0F9FF" />
            <TraceBar width="83%" color={COLORS.accent.yellow} />
          </div>
        </div>

        {/* Sidebar */}
        <div
          className="col-span-1 border-l pl-4 flex flex-col gap-3"
          style={{ borderColor: COLORS.border.light }}
        >
          <div className="h-2 w-16 bg-slate-200 rounded-full" />
          <div className="h-2 w-12 bg-slate-100 rounded-full" />

          <div className="mt-4 space-y-2">
            {/* Alert Card */}
            <div
              className="h-9 w-full rounded-lg flex items-center justify-center shadow-sm"
              style={{
                backgroundColor: "#FEF2F2",
                border: "1px solid #FEE2E2",
              }}
            >
              <AlertCircle className="w-4 h-4 text-red-500" />
            </div>
            <div
              className="h-9 w-full rounded-lg shadow-sm"
              style={{
                backgroundColor: COLORS.bg.white,
                border: "1px solid #F1F5F9",
              }}
            />
            <div
              className="h-9 w-full rounded-lg shadow-sm"
              style={{
                backgroundColor: COLORS.bg.white,
                border: "1px solid #F1F5F9",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function TraceBar({ width, color }: { width: string; color: string }) {
  return (
    <div
      className="h-2.5 w-full rounded-full overflow-hidden"
      style={{ backgroundColor: "#F1F5F9", border: "1px solid #E2E8F0" }}
    >
      <div
        className="h-full rounded-full"
        style={{ width, backgroundColor: color }}
      />
    </div>
  );
}
