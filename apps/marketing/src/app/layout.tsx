import type { Metadata } from "next";
import { IBM_Plex_Sans, Space_Grotesk, Noto_Sans_Mono } from "next/font/google";

import { MarketingNav } from "@/components/layout/marketing-nav";
import { MarketingFooter } from "@/components/layout/marketing-footer";
import { BackgroundAmbience } from "@/components/shared/background-ambience";
import "./globals.css";

const ibmPlex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-space-grotesk",
});

const notoSansMono = Noto_Sans_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-mono",
});

export const metadata: Metadata = {
  title: "CognObserve - AI Platform Monitoring & Observability",
  description:
    "Production-grade AI observability with zero overhead. Get p99 latency insights, distributed tracing, and AI-guided root cause analysis.",
  keywords: [
    "AI observability",
    "LLM monitoring",
    "distributed tracing",
    "OTLP",
    "OpenTelemetry",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <body
        className={`${ibmPlex.variable} ${spaceGrotesk.variable} ${notoSansMono.variable} font-sans relative overflow-x-hidden`}
      >
        <BackgroundAmbience />
        <MarketingNav />
        <main>{children}</main>
        <MarketingFooter />
      </body>
    </html>
  );
}
