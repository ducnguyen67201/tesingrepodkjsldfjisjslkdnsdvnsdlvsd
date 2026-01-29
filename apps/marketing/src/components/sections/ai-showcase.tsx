import { Bot, Check, Sparkles, MessageSquare, Zap } from "lucide-react";
import { AI_FEATURES } from "@/lib/constants";
import { COLORS } from "@/lib/colors";

/**
 * AI integration showcase section with chat mockup and feature list.
 */
export function AiShowcase() {
  return (
    <section
      id="how-it-works"
      className="py-24 px-6 sm:px-8 lg:px-12 relative overflow-hidden"
      style={{
        borderTop: `1px solid ${COLORS.border.light}`,
        backgroundColor: "rgba(255, 255, 255, 0.4)",
      }}
    >
      {/* Background Glow */}
      <div
        className="absolute right-0 top-1/2 -translate-y-1/2 w-[600px] h-[600px] opacity-30 blur-[120px] rounded-full pointer-events-none"
        style={{ backgroundColor: COLORS.glow.yellow }}
      />
      <div
        className="absolute left-0 bottom-0 w-[400px] h-[400px] opacity-20 blur-[100px] rounded-full pointer-events-none"
        style={{ backgroundColor: COLORS.glow.ice }}
      />

      <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
        {/* Chat Mockup */}
        <div className="relative">
          {/* Background Dashboard Preview */}
          <div
            className="absolute -left-8 -top-8 w-full h-full rounded-2xl opacity-60"
            style={{
              backgroundColor: "#F1F5F9",
              border: "1px solid #E2E8F0",
            }}
          />
          <AiChatMockup />
        </div>

        {/* Content */}
        <div className="order-first lg:order-last">
          <div className="flex items-center gap-2 mb-4">
            <div
              className="px-3 py-1 rounded-full flex items-center gap-1.5"
              style={{
                backgroundColor: "#FFFBEB",
                border: "1px solid #FDE68A",
              }}
            >
              <Sparkles
                className="w-3.5 h-3.5"
                style={{ color: COLORS.accent.yellowStrong }}
              />
              <span
                className="text-xs font-semibold"
                style={{ color: COLORS.accent.yellowStrong }}
              >
                AI-Powered
              </span>
            </div>
          </div>

          <h2
            className="font-display text-4xl font-semibold mb-6"
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
    <div
      className="relative glass-panel p-3 shadow-2xl"
      style={{
        boxShadow: `0 25px 50px -12px rgba(0, 0, 0, 0.15), 0 0 40px ${COLORS.glow.yellow}`,
      }}
    >
      {/* Chat Header */}
      <div
        className="flex items-center justify-between px-4 py-3 rounded-t-xl border-b"
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.8)",
          borderColor: "#E2E8F0",
        }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{
              backgroundColor: "#FFFBEB",
              border: "1px solid #FDE68A",
            }}
          >
            <Sparkles
              className="w-4 h-4"
              style={{ color: COLORS.accent.yellowStrong }}
            />
          </div>
          <div>
            <div
              className="text-sm font-semibold"
              style={{ color: COLORS.ink.primary }}
            >
              Ducsigr AI
            </div>
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <span
                className="text-[10px]"
                style={{ color: COLORS.ink.muted }}
              >
                Online
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Zap
            className="w-3.5 h-3.5"
            style={{ color: COLORS.accent.yellowStrong }}
          />
          <span
            className="text-[10px] font-medium"
            style={{ color: COLORS.ink.muted }}
          >
            Proactive Mode
          </span>
        </div>
      </div>

      {/* Chat Messages */}
      <div
        className="rounded-b-xl p-4 space-y-4"
        style={{
          backgroundColor: COLORS.bg.white,
        }}
      >
        {/* AI Message */}
        <div className="flex gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            style={{
              backgroundColor: "#FFFBEB",
              border: "1px solid #FDE68A",
            }}
          >
            <Bot
              className="w-4 h-4"
              style={{ color: COLORS.accent.yellowStrong }}
            />
          </div>

          <div className="space-y-3 flex-1">
            <div
              className="p-3 rounded-xl rounded-tl-sm"
              style={{
                backgroundColor: "#F8FAFC",
                border: "1px solid #E2E8F0",
              }}
            >
              <p
                className="text-sm leading-relaxed"
                style={{ color: COLORS.ink.primary }}
              >
                I noticed a{" "}
                <span
                  className="font-semibold px-1.5 py-0.5 rounded"
                  style={{
                    color: COLORS.accent.yellowStrong,
                    backgroundColor: "#FFFBEB",
                  }}
                >
                  300% increase
                </span>{" "}
                in deadlocks on the{" "}
                <code
                  className="font-mono text-xs px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: "#F1F5F9",
                    color: COLORS.ink.primary,
                  }}
                >
                  orders
                </code>{" "}
                table starting at 14:02 UTC.
              </p>
            </div>

            {/* Code Block */}
            <div
              className="p-3 rounded-lg font-mono text-xs"
              style={{
                backgroundColor: "#1E293B",
                color: "#E2E8F0",
              }}
            >
              <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-600">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <div className="w-2 h-2 rounded-full bg-yellow-500" />
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-[10px] text-slate-400 ml-2">
                  Problematic Query
                </span>
              </div>
              <code>
                <span style={{ color: "#93C5FD" }}>UPDATE</span> orders{" "}
                <span style={{ color: "#93C5FD" }}>SET</span> status ={" "}
                <span style={{ color: "#86EFAC" }}>&apos;processed&apos;</span>
                <br />
                <span style={{ color: "#93C5FD" }}>WHERE</span> id = $1;
              </code>
            </div>

            {/* Suggestion */}
            <div
              className="p-3 rounded-lg"
              style={{
                backgroundColor: "#ECFDF5",
                border: "1px solid #A7F3D0",
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-xs font-semibold text-emerald-700">
                  Suggested Fix
                </span>
              </div>
              <p className="text-xs text-emerald-700">
                Add row-level locking with{" "}
                <code className="font-mono bg-emerald-100 px-1 rounded">
                  SELECT FOR UPDATE
                </code>{" "}
                before the UPDATE statement.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <ActionButton primary>Apply Fix</ActionButton>
              <ActionButton>See related traces</ActionButton>
              <ActionButton>Dismiss</ActionButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  children,
  primary,
}: {
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <button
      className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors shadow-sm"
      style={
        primary
          ? {
              backgroundColor: COLORS.accent.yellowStrong,
              border: "1px solid #B45309",
              color: "#FFFFFF",
            }
          : {
              backgroundColor: COLORS.bg.white,
              border: "1px solid #E2E8F0",
              color: COLORS.ink.secondary,
            }
      }
    >
      {children}
    </button>
  );
}
