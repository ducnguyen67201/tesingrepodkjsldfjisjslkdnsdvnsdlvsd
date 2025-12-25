"use client";

import { IconWrapper } from "@/components/shared/icon-wrapper";
import { cn } from "@/lib/utils";
import { COLORS } from "@/lib/colors";
import type { LucideIcon } from "lucide-react";

type FeatureColor = "sky" | "yellow" | "green" | "slate";

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
  color: FeatureColor;
}

interface FeatureCardProps {
  feature: Feature;
}

const HOVER_BORDER_COLORS: Record<FeatureColor, string> = {
  sky: "#BAE6FD",
  yellow: "#FDE68A",
  green: "#A7F3D0",
  slate: "#CBD5E1",
};

/**
 * Individual feature card with icon, title, and description.
 * Includes hover effects with color-matched borders.
 */
export function FeatureCard({ feature }: FeatureCardProps) {
  const { icon, title, description, color } = feature;
  const hoverBorder = HOVER_BORDER_COLORS[color];

  return (
    <div
      className={cn(
        "glass-panel p-6 transition-all duration-300 group",
        "hover:shadow-lg hover:-translate-y-0.5"
      )}
      style={
        {
          "--hover-border": hoverBorder,
          "--hover-shadow": COLORS.feature[color].hover,
        } as React.CSSProperties
      }
    >
      <style jsx>{`
        .glass-panel:hover {
          border-color: var(--hover-border);
          box-shadow: 0 10px 25px -5px var(--hover-shadow);
        }
      `}</style>

      <IconWrapper
        icon={icon}
        color={color}
        className="mb-4 group-hover:scale-105 transition-transform"
      />

      <h3
        className="font-semibold text-lg mb-2"
        style={{ color: COLORS.ink.primary }}
      >
        {title}
      </h3>

      <p
        className="text-sm leading-relaxed"
        style={{ color: COLORS.ink.secondary }}
      >
        {description}
      </p>
    </div>
  );
}
