import { AlertCircle, TrendingUp, Zap, DollarSign } from "lucide-react";
import { COLORS } from "@/lib/colors";

/**
 * Animated dashboard mockup card for the hero section.
 * Shows latency metrics, charts, and alerts.
 */
export function DashboardMockup() {
  return (
    <div className="relative w-full min-w-[500px] md:min-w-[600px] aspect-[4/3] glass-panel-high overflow-hidden z-10 animate-float ring-1 ring-black/5">
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
        className="p-5 grid grid-cols-3 gap-4"
        style={{ backgroundColor: "rgba(255, 255, 255, 0.4)" }}
      >
        {/* Main Content Area */}
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
          <div className="space-y-2.5">
            <TraceBar width="75%" color={COLORS.feature.sky.bg} label="LLM Call" />
            <TraceBar width="50%" color="#E0E7FF" label="Retrieval" />
            <TraceBar width="83%" color={COLORS.accent.yellow} label="Response" />
          </div>

          {/* Mini Stats Row */}
          <div className="grid grid-cols-3 gap-3 mt-2">
            <MiniStatCard
              icon={<Zap className="w-3 h-3" />}
              label="Tokens"
              value="1.2M"
              color="#8B5CF6"
            />
            <MiniStatCard
              icon={<DollarSign className="w-3 h-3" />}
              label="Cost"
              value="$24.50"
              color="#10B981"
            />
            <MiniStatCard
              icon={<TrendingUp className="w-3 h-3" />}
              label="Requests"
              value="8.4K"
              color="#3B82F6"
            />
          </div>

          {/* Mini Line Chart */}
          <div
            className="rounded-lg p-3 mt-1"
            style={{ backgroundColor: "#F8FAFC", border: "1px solid #E2E8F0" }}
          >
            <div className="flex justify-between items-center mb-2">
              <span
                className="text-[9px] font-medium uppercase tracking-wide"
                style={{ color: COLORS.ink.muted }}
              >
                Request Volume (24h)
              </span>
              <span
                className="text-[9px] font-mono"
                style={{ color: COLORS.ink.secondary }}
              >
                Peak: 2.4K
              </span>
            </div>
            <svg className="w-full h-10" viewBox="0 0 200 40">
              <polyline
                fill="none"
                stroke="#E2E8F0"
                strokeWidth="2"
                points="0,35 20,30 40,32 60,25 80,28 100,20 120,22 140,15 160,18 180,10 200,12"
              />
              <polyline
                fill="none"
                stroke={COLORS.accent.yellowStrong}
                strokeWidth="2"
                strokeLinecap="round"
                points="0,35 20,30 40,32 60,25 80,28 100,20 120,22 140,15 160,18 180,10 200,12"
                className="animate-pulse"
              />
            </svg>
          </div>
        </div>

        {/* Sidebar */}
        <div
          className="col-span-1 border-l pl-4 flex flex-col gap-3"
          style={{ borderColor: COLORS.border.light }}
        >
          <div className="h-2 w-16 bg-slate-200 rounded-full" />
          <div className="h-2 w-12 bg-slate-100 rounded-full" />

          <div className="mt-2 space-y-2">
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

          {/* Model Info */}
          <div
            className="mt-auto rounded-lg p-2.5"
            style={{ backgroundColor: "#F8FAFC", border: "1px solid #E2E8F0" }}
          >
            <div
              className="text-[9px] font-medium uppercase tracking-wide mb-1.5"
              style={{ color: COLORS.ink.muted }}
            >
              Active Model
            </div>
            <div
              className="text-[11px] font-mono font-medium"
              style={{ color: COLORS.ink.primary }}
            >
              gpt-4o
            </div>
            <div className="flex items-center gap-1.5 mt-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <span
                className="text-[9px]"
                style={{ color: COLORS.ink.secondary }}
              >
                Healthy
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TraceBar({
  width,
  color,
  label,
}: {
  width: string;
  color: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="text-[8px] font-medium w-14 shrink-0"
        style={{ color: COLORS.ink.muted }}
      >
        {label}
      </span>
      <div
        className="h-2.5 flex-1 rounded-full overflow-hidden"
        style={{ backgroundColor: "#F1F5F9", border: "1px solid #E2E8F0" }}
      >
        <div
          className="h-full rounded-full"
          style={{ width, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function MiniStatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      className="rounded-lg p-2"
      style={{ backgroundColor: "#F8FAFC", border: "1px solid #E2E8F0" }}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span style={{ color }}>{icon}</span>
        <span
          className="text-[8px] font-medium uppercase tracking-wide"
          style={{ color: COLORS.ink.muted }}
        >
          {label}
        </span>
      </div>
      <div
        className="text-xs font-mono font-semibold"
        style={{ color: COLORS.ink.primary }}
      >
        {value}
      </div>
    </div>
  );
}
