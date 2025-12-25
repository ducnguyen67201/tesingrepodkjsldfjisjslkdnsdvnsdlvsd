import { cn } from "@/lib/utils";
import { COLORS } from "@/lib/colors";

type OrbColor = "ice" | "yellow" | "indigo";
type OrbSize = "sm" | "md" | "lg";

interface GradientOrbProps {
  color: OrbColor;
  position: {
    top?: string;
    left?: string;
    right?: string;
    bottom?: string;
  };
  size?: OrbSize;
  className?: string;
}

const SIZE_MAP: Record<OrbSize, string> = {
  sm: "w-[400px] h-[400px]",
  md: "w-[600px] h-[600px]",
  lg: "w-[800px] h-[800px]",
};

const COLOR_MAP: Record<OrbColor, string> = {
  ice: COLORS.glow.ice,
  yellow: COLORS.glow.yellow,
  indigo: COLORS.glow.indigo,
};

/**
 * Decorative gradient orb for background effects.
 */
export function GradientOrb({
  color,
  position,
  size = "md",
  className,
}: GradientOrbProps) {
  return (
    <div
      className={cn(
        "absolute rounded-full blur-[100px] opacity-50 mix-blend-multiply pointer-events-none",
        SIZE_MAP[size],
        className
      )}
      style={{
        backgroundColor: COLOR_MAP[color],
        ...position,
      }}
    />
  );
}
