import {
  ShieldCheck,
  Zap,
  Network,
  Twitter,
  Github,
  Linkedin,
  type LucideIcon,
} from "lucide-react";

import { env } from "./env";

// ============================================
// External Links
// ============================================
export const CALENDAR_BOOKING_URL = env.CALENDAR_BOOKING_URL;

// ============================================
// Navigation
// ============================================
export const NAV_LINKS = [
  { label: "Why Us", href: "/" },
  { label: "Use Cases", href: "/use-cases" },
] as const;

// ============================================
// FAQ
// ============================================
export interface FAQ {
  question: string;
  answer: string;
}

export const FAQS: FAQ[] = [
  {
    question: "What is the performance overhead?",
    answer:
      "We use eBPF and lightweight agents to ensure overhead remains below 1% of CPU and memory, even under high load. We are designed specifically for latency-sensitive AI/LLM environments.",
  },
  {
    question: "How long is data retained?",
    answer:
      "By default, data is retained for 7 days. Extended retention periods are available on paid plans to meet your compliance and debugging requirements.",
  },
  {
    question: "Can I self-host the collector?",
    answer:
      "Yes. While our control plane is SaaS, you can deploy the data collector within your own VPC to sanitize data before it reaches our cloud.",
  },
];

// ============================================
// Trust Metrics
// ============================================
export interface TrustMetric {
  value: string;
  label: string;
}

export const TRUST_METRICS: TrustMetric[] = [
  { value: "2.5ms", label: "Ingest Latency" },
  { value: "99.99%", label: "Uptime SLA" },
  { value: "100%", label: "Data Ownership" },
  { value: "SOC2", label: "In Progress" },
];

// ============================================
// Ticker Items
// ============================================
export type TickerStatus = "healthy" | "info" | "warning" | "muted";

export interface TickerItem {
  status: TickerStatus;
  label: string;
}

export const TICKER_ITEMS: TickerItem[] = [
  { status: "healthy", label: "SYSTEM_STATUS: HEALTHY" },
  { status: "info", label: "INGEST: 1.2GB/s" },
  { status: "warning", label: "P99: 142ms" },
  { status: "muted", label: "ERROR_RATE: 0.001%" },
  { status: "info", label: "ACTIVE_TRACES: 24,050" },
];

// ============================================
// Footer Links
// ============================================
export interface FooterLink {
  label: string;
  href: string;
}

export interface FooterSection {
  title: string;
  links: FooterLink[];
}

export const FOOTER_SECTIONS: FooterSection[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "Use Cases", href: "/use-cases" },
      { label: "Integrations", href: "#integrations" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/" },
      { label: "Book a Demo", href: "/demo" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/privacy" },
    ],
  },
];

export interface SocialLink {
  name: string;
  href: string;
  icon: LucideIcon;
}

export const SOCIAL_LINKS: SocialLink[] = [
  { name: "Twitter", href: "https://twitter.com/ducsigr", icon: Twitter },
  { name: "GitHub", href: "https://github.com/ducsigr", icon: Github },
  { name: "LinkedIn", href: "https://linkedin.com/company/ducsigr", icon: Linkedin },
];

// ============================================
// Hero Section
// ============================================
export const HERO_BADGES = [
  { icon: ShieldCheck, label: "SOC2 Pending" },
  { icon: Zap, label: "< 1% Overhead" },
  { icon: Network, label: "OpenTelemetry" },
] as const;

export const AI_FEATURES = [
  "Natural language query generation",
  "Automated anomaly correlation",
  "Runbook suggestions based on error patterns",
] as const;
