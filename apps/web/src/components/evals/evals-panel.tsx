"use client";

import { useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FlaskConical, Plus, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { EvalSuiteCard } from "./eval-suite-card";
import { EvalRunHistory } from "./eval-run-history";
import { CreateEvalSuiteDialog } from "./create-eval-suite-dialog";
import { useEvalSuites } from "@/hooks/use-eval-suites";
import { useTriggerEval } from "@/hooks/use-trigger-eval";

interface EvalsPanelProps {
  workspaceSlug: string;
  projectId: string;
}

type View = "suites" | "runs";

export function EvalsPanel({ workspaceSlug, projectId }: EvalsPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const isOpen = searchParams.get("panel") === "evals";
  const urlSuiteId = searchParams.get("suiteId");
  const view: View = urlSuiteId ? "runs" : "suites";
  const selectedSuiteId = urlSuiteId;

  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const {
    suites,
    isLoading,
    deleteSuite,
    toggleSuite,
    isDeleting,
    isToggling,
  } = useEvalSuites({ workspaceSlug, projectId });

  const { triggerRun, isTriggering } = useTriggerEval({ workspaceSlug });

  const updateUrl = useCallback((params: Record<string, string | null>) => {
    const url = new URL(window.location.href);
    Object.entries(params).forEach(([key, value]) => {
      if (value === null) {
        url.searchParams.delete(key);
      } else {
        url.searchParams.set(key, value);
      }
    });
    router.push(url.pathname + url.search);
  }, [router]);

  const setIsOpen = useCallback((open: boolean) => {
    if (open) {
      updateUrl({ panel: "evals" });
    } else {
      updateUrl({ panel: null, suiteId: null });
    }
  }, [updateUrl]);

  const handleViewRuns = useCallback((suiteId: string) => {
    updateUrl({ panel: "evals", suiteId });
  }, [updateUrl]);

  const handleBackToSuites = useCallback(() => {
    updateUrl({ panel: "evals", suiteId: null });
  }, [updateUrl]);

  const handleEdit = useCallback((suiteId: string) => {
    // TODO: Implement edit dialog
    console.log("Edit suite:", suiteId);
  }, []);

  const handleDelete = useCallback(
    async (suiteId: string) => {
      await deleteSuite(suiteId);
    },
    [deleteSuite]
  );

  const handleToggle = useCallback(
    async (suiteId: string) => {
      await toggleSuite(suiteId);
    },
    [toggleSuite]
  );

  const handleTrigger = useCallback(
    async (suiteId: string) => {
      await triggerRun(suiteId);
    },
    [triggerRun]
  );

  const selectedSuite = suites.find((s) => s.id === selectedSuiteId);

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <FlaskConical className="h-4 w-4" />
          Evals
          {suites.length > 0 && (
            <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs">
              {suites.length}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[460px] sm:w-[520px] flex flex-col p-0">
        <SheetTitle className="sr-only">
          {view === "suites" ? "Eval Suites" : "Run History"}
        </SheetTitle>
        <div className="flex items-center justify-between pl-6 pr-14 py-4 border-b">
          <div className="flex items-center gap-3">
            {view === "runs" && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleBackToSuites}
                className="h-8 w-8 shrink-0 -ml-2"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div>
              <h2 className="text-lg font-semibold">
                {view === "suites"
                  ? "Eval Suites"
                  : selectedSuite?.name ?? "Run History"}
              </h2>
              {view === "suites" && (
                <p className="text-sm text-muted-foreground">
                  Automated regression testing
                </p>
              )}
            </div>
          </div>
          {view === "suites" && (
            <Button size="sm" onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              New Suite
            </Button>
          )}
        </div>

        <div className="flex-1 px-6 py-4 overflow-hidden">
          {view === "suites" ? (
            <SuitesView
              suites={suites}
              isLoading={isLoading}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onToggle={handleToggle}
              onTrigger={handleTrigger}
              onViewRuns={handleViewRuns}
              isDeleting={isDeleting}
              isToggling={isToggling}
              isTriggering={isTriggering}
            />
          ) : (
            selectedSuiteId && (
              <EvalRunHistory
                workspaceSlug={workspaceSlug}
                suiteId={selectedSuiteId}
              />
            )
          )}
        </div>

        <CreateEvalSuiteDialog
          open={isCreateOpen}
          onOpenChange={setIsCreateOpen}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
        />
      </SheetContent>
    </Sheet>
  );
}

interface SuitesViewProps {
  suites: Array<{
    id: string;
    name: string;
    description?: string | null;
    enabled: boolean;
    endpoint: string;
    promptCount: number;
    runCount: number;
    lastRun: {
      id: string;
      status: string;
      isRegression: boolean | null;
      createdAt: Date;
    } | null;
    hasBaseline: boolean;
    latencyRegressionThreshold: number;
    errorRegressionThreshold: number;
  }>;
  isLoading: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  onToggle: (id: string) => Promise<void>;
  onTrigger: (id: string) => Promise<void>;
  onViewRuns: (id: string) => void;
  isDeleting: boolean;
  isToggling: boolean;
  isTriggering: boolean;
}

function SuitesView({
  suites,
  isLoading,
  onEdit,
  onDelete,
  onToggle,
  onTrigger,
  onViewRuns,
  isDeleting,
  isToggling,
  isTriggering,
}: SuitesViewProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-4">
            <div className="space-y-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
              <div className="flex gap-4">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (suites.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <div className="rounded-full bg-muted/50 p-5">
          <FlaskConical className="h-10 w-10 text-muted-foreground/70" />
        </div>
        <h3 className="mt-6 text-base font-semibold">No eval suites yet</h3>
        <p className="mt-2 text-sm text-muted-foreground max-w-[260px] leading-relaxed">
          Create an eval suite to automatically test your AI endpoints when PRs are merged.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 pr-4">
        {suites.map((suite) => (
          <EvalSuiteCard
            key={suite.id}
            {...suite}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggle={onToggle}
            onTrigger={onTrigger}
            onViewRuns={onViewRuns}
            isDeleting={isDeleting}
            isToggling={isToggling}
            isTriggering={isTriggering}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
