"use client";

import Image from "next/image";
import { Calendar, ArrowRight, Clock, Video, Sparkles } from "lucide-react";
import { COLORS } from "@/lib/colors";
import { CALENDAR_BOOKING_URL } from "@/lib/constants";

const FOUNDER_IMAGE = "/founder.jpg";
const FOUNDER_NAME = "Duc Nguyen";
const FOUNDER_TITLE = "Founder";

const MEETING_HIGHLIGHTS = [
  { icon: Clock, text: "30 min" },
  { icon: Video, text: "Video call" },
  { icon: Sparkles, text: "Personalized" },
];

/**
 * Demo booking page - centered, eye-catching design.
 */
export default function DemoPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-6 py-12"
      style={{
        background: `
          radial-gradient(ellipse 80% 50% at 50% -20%, rgba(251, 191, 36, 0.15), transparent),
          linear-gradient(180deg, #FAFAFA 0%, #FEF9E7 50%, #FAFAFA 100%)
        `,
      }}
    >
      {/* Decorative elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-20 left-10 w-72 h-72 rounded-full blur-3xl opacity-20"
          style={{ backgroundColor: COLORS.accent.yellow }}
        />
        <div
          className="absolute bottom-20 right-10 w-96 h-96 rounded-full blur-3xl opacity-15"
          style={{ backgroundColor: COLORS.accent.yellow }}
        />
      </div>

      <div className="max-w-lg w-full relative z-10">
        {/* Main Card */}
        <div
          className="rounded-3xl p-8 md:p-10 shadow-2xl"
          style={{
            backgroundColor: COLORS.bg.white,
            border: "1px solid rgba(0,0,0,0.06)",
          }}
        >
          {/* Founder Profile */}
          <div className="flex flex-col items-center mb-8">
            <div
              className="relative w-24 h-24 rounded-full overflow-hidden mb-4"
              style={{
                boxShadow: `0 0 0 4px ${COLORS.accent.yellow}`,
              }}
            >
              <Image
                src={FOUNDER_IMAGE}
                alt={FOUNDER_NAME}
                fill
                className="object-cover object-[center_80%]"
                priority
              />
            </div>

            <h3
              className="text-lg font-bold"
              style={{ color: COLORS.ink.primary }}
            >
              {FOUNDER_NAME}
            </h3>
            <p className="text-sm" style={{ color: COLORS.ink.muted }}>
              {FOUNDER_TITLE}
            </p>
          </div>

          {/* Divider */}
          <div
            className="h-px w-full mb-8"
            style={{ backgroundColor: "#E2E8F0" }}
          />

          {/* Content */}
          <div className="text-center space-y-6">
            <div>
              <h1
                className="text-3xl md:text-4xl font-bold mb-3"
                style={{ color: COLORS.ink.primary }}
              >
                Book a Demo
              </h1>
              <p
                className="text-base leading-relaxed"
                style={{ color: COLORS.ink.secondary }}
              >
                See how Ducsigr can transform your AI observability.
                <br />
                <span className="font-medium">No commitment required.</span>
              </p>
            </div>

            {/* Meeting Highlights */}
            <div className="flex items-center justify-center gap-4 flex-wrap">
              {MEETING_HIGHLIGHTS.map(({ icon: Icon, text }) => (
                <div
                  key={text}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full"
                  style={{
                    backgroundColor: "#FEF9E7",
                    border: "1px solid #FDE68A",
                  }}
                >
                  <Icon
                    className="w-3.5 h-3.5"
                    style={{ color: COLORS.accent.yellowStrong }}
                  />
                  <span
                    className="text-xs font-medium"
                    style={{ color: COLORS.accent.yellowStrong }}
                  >
                    {text}
                  </span>
                </div>
              ))}
            </div>

            {/* CTA Button */}
            <a
              href={CALENDAR_BOOKING_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group w-full h-14 rounded-xl text-base font-semibold flex items-center justify-center gap-3 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg"
              style={{
                background: `linear-gradient(135deg, ${COLORS.accent.yellow} 0%, ${COLORS.accent.yellowStrong} 100%)`,
                color: COLORS.ink.primary,
              }}
            >
              <Calendar className="w-5 h-5" />
              Schedule Your Demo
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </a>

            {/* Helper text */}
            <p className="text-xs" style={{ color: COLORS.ink.muted }}>
              Pick a time that works for you
            </p>
          </div>
        </div>

        {/* Bottom message */}
        <div className="mt-8 text-center">
          <p className="text-sm" style={{ color: COLORS.ink.muted }}>
            Built on{" "}
            <span className="font-medium" style={{ color: COLORS.ink.secondary }}>
              OpenTelemetry
            </span>
            {" · "}
            No vendor lock-in
            {" · "}
            <span className="font-medium" style={{ color: COLORS.ink.secondary }}>
              SOC2
            </span>
            {" "}in progress
          </p>
        </div>
      </div>
    </div>
  );
}
