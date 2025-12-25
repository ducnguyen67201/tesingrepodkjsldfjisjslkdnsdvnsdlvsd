import {
  Play,
  Pause,
  CheckCircle,
  Archive,
  FlaskConical,
} from "lucide-react";
import type { ExperimentStatus } from "@cognobserve/api/schemas";

export interface StatusFilter {
  value: ExperimentStatus | "all";
  label: string;
  icon: typeof Play;
}

export const STATUS_FILTERS: StatusFilter[] = [
  { value: "running", label: "Running", icon: Play },
  { value: "paused", label: "Paused", icon: Pause },
  { value: "completed", label: "Completed", icon: CheckCircle },
  { value: "draft", label: "Draft", icon: FlaskConical },
  { value: "archived", label: "Archived", icon: Archive },
];

export function getStatusColor(status: ExperimentStatus): string {
  const colors: Record<ExperimentStatus, string> = {
    draft: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
    running:
      "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    paused:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    completed:
      "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    archived: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  };
  return colors[status] ?? colors.draft;
}

export function getStatusLabel(status: ExperimentStatus): string {
  const labels: Record<ExperimentStatus, string> = {
    draft: "Draft",
    running: "Running",
    paused: "Paused",
    completed: "Completed",
    archived: "Archived",
  };
  return labels[status] ?? status;
}
