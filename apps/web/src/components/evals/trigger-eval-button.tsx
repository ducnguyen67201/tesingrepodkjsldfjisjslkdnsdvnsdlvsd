"use client";

import { Play, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TriggerEvalButtonProps {
  onTrigger: () => void;
  isTriggering: boolean;
  disabled?: boolean;
  size?: "default" | "sm" | "lg" | "icon";
}

export function TriggerEvalButton({
  onTrigger,
  isTriggering,
  disabled,
  size = "sm",
}: TriggerEvalButtonProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size={size}
            onClick={onTrigger}
            disabled={disabled || isTriggering}
          >
            {isTriggering ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {size !== "icon" && <span className="ml-1">Run</span>}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Trigger manual eval run</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
