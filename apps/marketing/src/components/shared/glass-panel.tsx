import { cn } from "@/lib/utils";

interface GlassPanelProps {
  variant?: "default" | "high";
  className?: string;
  children: React.ReactNode;
}

/**
 * Reusable glassmorphism panel component.
 * - default: Subtle glass effect for cards
 * - high: Elevated glass effect for prominent elements
 */
export function GlassPanel({
  variant = "default",
  className,
  children,
}: GlassPanelProps) {
  return (
    <div
      className={cn(
        variant === "default" ? "glass-panel" : "glass-panel-high",
        className
      )}
    >
      {children}
    </div>
  );
}
