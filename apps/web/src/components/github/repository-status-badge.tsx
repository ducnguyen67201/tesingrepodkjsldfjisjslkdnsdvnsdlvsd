import { CheckCircle, Circle, Loader2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { IndexStatus } from "@ducsigr/api/schemas";

interface RepositoryStatusBadgeProps {
  enabled: boolean;
  status: IndexStatus;
}

export function RepositoryStatusBadge({
  enabled,
  status,
}: RepositoryStatusBadgeProps) {
  if (!enabled) {
    return (
      <Badge variant="secondary" className="gap-1">
        <Circle className="h-3 w-3" />
        DISABLED
      </Badge>
    );
  }

  switch (status) {
    case "INDEXING":
    case "UPDATING":
      return (
        <Badge
          variant="secondary"
          className={cn(
            "gap-1",
            "bg-blue-500/10 text-blue-600 border-blue-500/20",
            "dark:bg-blue-500/20 dark:text-blue-400"
          )}
        >
          <Loader2 className="h-3 w-3 animate-spin" />
          {status}
        </Badge>
      );
    case "READY":
      return (
        <Badge
          variant="secondary"
          className={cn(
            "gap-1",
            "bg-green-500/10 text-green-600 border-green-500/20",
            "dark:bg-green-500/20 dark:text-green-400"
          )}
        >
          <CheckCircle className="h-3 w-3" />
          ENABLED
        </Badge>
      );
    case "FAILED":
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="h-3 w-3" />
          FAILED
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="gap-1">
          <Circle className="h-3 w-3" />
          PENDING
        </Badge>
      );
  }
}
