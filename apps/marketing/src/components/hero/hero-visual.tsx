import { DashboardMockup } from "./dashboard-mockup";
import { AiInsightPanel } from "./ai-insight-panel";
import { COLORS } from "@/lib/colors";

/**
 * Hero visual section with dashboard mockup and AI insight panel.
 */
export function HeroVisual() {
  return (
    <div className="relative h-full min-h-[400px] flex items-center justify-center">
      {/* Background Glow */}
      <div
        className="absolute inset-0 blur-3xl rounded-full -z-10"
        style={{
          background: `linear-gradient(to top right, ${COLORS.glow.yellow}, ${COLORS.glow.ice})`,
        }}
      />

      {/* Dashboard Mockup */}
      <DashboardMockup />

      {/* AI Insight Panel - Floating */}
      <AiInsightPanel />
    </div>
  );
}
