import { Bot, Check } from "lucide-react";
import { AI_FEATURES } from "@/lib/constants";
import { COLORS } from "@/lib/colors";

/**
 * AI integration showcase section with chat mockup and feature list.
 */
export function AiShowcase() {
  return (
    <section
      id="how-it-works"
      className="py-24 px-6 relative overflow-hidden"
      style={{
        borderTop: `1px solid ${COLORS.border.light}`,
        backgroundColor: "rgba(255, 255, 255, 0.4)",
      }}
    >
      {/* Background Glow */}
      <div
        className="absolute right-0 top-1/2 -translate-y-1/2 w-[600px] h-[600px] opacity-20 blur-[120px] rounded-full pointer-events-none"
        style={{ backgroundColor: COLORS.glow.yellow }}
      />

      <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
        {/* Chat Mockup */}
        <div className="relative">
          <AiChatMockup />
        </div>

        {/* Content */}
        <div className="order-first lg:order-last">
          <h2
            className="font-display text-3xl font-semibold mb-6"
            style={{ color: COLORS.ink.primary }}
          >
            Your engineering assistant, <br />
            built into the dashboard.
          </h2>

          <p
            className="text-lg mb-8 leading-relaxed"
            style={{ color: COLORS.ink.secondary }}
          >
            Context switching kills productivity. Our AI Accessory Rail sits
            alongside your telemetry, offering proactive insights, query
            explanations, and remediation steps without you needing to leave the
            view.
          </p>

          {/* Feature List */}
          <ul className="space-y-4">
            {AI_FEATURES.map((feature) => (
              <li
                key={feature}
                className="flex items-center gap-3 font-medium"
                style={{ color: COLORS.ink.primary }}
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: COLORS.feature.green.bg }}
                >
                  <Check
                    className="w-3.5 h-3.5"
                    style={{ color: COLORS.status.healthy }}
                  />
                </div>
                {feature}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function AiChatMockup() {
  return (
    <div className="glass-panel p-2 shadow-2xl shadow-orange-500/5">
      <div
        className="rounded-xl p-6 space-y-4"
        style={{
          backgroundColor: COLORS.bg.white,
          border: `1px solid #F1F5F9`,
        }}
      >
        <div className="flex gap-4">
          {/* AI Avatar */}
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm"
            style={{
              backgroundColor: "#FFFBEB",
              border: "1px solid #FDE68A",
            }}
          >
            <Bot
              className="w-5 h-5"
              style={{ color: COLORS.accent.yellowStrong }}
            />
          </div>

          {/* Message Content */}
          <div className="space-y-3">
            <p
              className="text-sm leading-relaxed"
              style={{ color: COLORS.ink.primary }}
            >
              I noticed a{" "}
              <span
                className="font-semibold px-1 rounded"
                style={{
                  color: COLORS.accent.yellowStrong,
                  backgroundColor: "#FFFBEB",
                }}
              >
                300% increase
              </span>{" "}
              in deadlocks on the <code className="font-mono">orders</code>{" "}
              table starting at 14:02 UTC.
            </p>

            {/* Code Block */}
            <div
              className="p-3 rounded-lg"
              style={{
                backgroundColor: "#F8FAFC",
                borderLeft: `4px solid ${COLORS.accent.yellowStrong}`,
              }}
            >
              <p
                className="text-xs font-mono"
                style={{ color: COLORS.ink.muted }}
              >
                UPDATE orders SET status = &apos;processed&apos; WHERE id = $1;
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-1">
              <ActionButton>See related traces</ActionButton>
              <ActionButton>Rollback suggestions</ActionButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors shadow-sm"
      style={{
        backgroundColor: COLORS.bg.white,
        border: "1px solid #E2E8F0",
        color: COLORS.ink.secondary,
      }}
    >
      {children}
    </button>
  );
}
