import { cn } from "@/lib/utils";
import { COLORS } from "@/lib/colors";
import type { LucideIcon } from "lucide-react";

type IconColor = "sky" | "yellow" | "green" | "slate";
type IconSize = "sm" | "md" | "lg";

interface IconWrapperProps {
  icon: LucideIcon;
  color: IconColor;
  size?: IconSize;
  className?: string;
}

const SIZE_CLASSES: Record<IconSize, { wrapper: string; icon: number }> = {
  sm: { wrapper: "w-8 h-8", icon: 16 },
  md: { wrapper: "w-12 h-12", icon: 22 },
  lg: { wrapper: "w-16 h-16", icon: 28 },
};

/**
 * Icon wrapper with colored background.
 * Uses the centralized color system from lib/colors.ts
 */
export function IconWrapper({
  icon: Icon,
  color,
  size = "md",
  className,
}: IconWrapperProps) {
  const colorConfig = COLORS.feature[color];
  const sizeConfig = SIZE_CLASSES[size];

  return (
    <div
      className={cn(
        "rounded-xl flex items-center justify-center",
        sizeConfig.wrapper,
        className
      )}
      style={{
        backgroundColor: colorConfig.bg,
        borderWidth: 1,
        borderColor: colorConfig.border,
      }}
    >
      <Icon size={sizeConfig.icon} style={{ color: colorConfig.icon }} />
    </div>
  );
}
