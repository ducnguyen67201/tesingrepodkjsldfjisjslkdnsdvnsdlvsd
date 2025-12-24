"use client";

import { ThemeStudio } from "@/components/theme";

interface ThemeStudioClientProps {
  workspaceId: string;
}

export function ThemeStudioClient({ workspaceId }: ThemeStudioClientProps) {
  return <ThemeStudio workspaceId={workspaceId} />;
}
