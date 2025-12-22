"use client";

import { useState, useCallback } from "react";
import {
  Zap,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Eye,
  ToggleLeft,
  ToggleRight,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useKnowledgeRules } from "@/hooks/use-knowledge-rules";
import { KnowledgeRuleDialog } from "./knowledge-rule-dialog";
import type { KnowledgeRuleScope } from "@cognobserve/api/schemas";

interface KnowledgeRuleListProps {
  workspaceSlug: string;
  projectId?: string;
}

/** Scope badge colors */
const SCOPE_COLORS: Record<KnowledgeRuleScope, string> = {
  WORKSPACE: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  PROJECT: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
};

export function KnowledgeRuleList({
  workspaceSlug,
  projectId,
}: KnowledgeRuleListProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RuleData | null>(null);
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);

  const {
    rules,
    isLoading,
    error,
    updateRule,
    deleteRule,
    isDeleting,
  } = useKnowledgeRules({
    workspaceSlug,
    projectId,
  });

  const handleToggleEnabled = useCallback(
    async (rule: RuleData, enabled: boolean) => {
      await updateRule(rule.id, {
        name: rule.name,
        condition: rule.condition as Record<string, unknown>,
        enabled,
      });
    },
    [updateRule]
  );

  const handleEdit = useCallback((rule: RuleData) => {
    setEditingRule(rule);
  }, []);

  const handleDelete = useCallback(async () => {
    if (deletingRuleId) {
      await deleteRule(deletingRuleId);
      setDeletingRuleId(null);
    }
  }, [deleteRule, deletingRuleId]);

  const handleCloseEdit = useCallback(() => {
    setEditingRule(null);
  }, []);

  if (isLoading) {
    return <RuleListSkeleton />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="h-10 w-10 text-destructive/70" />
        <h3 className="mt-4 text-base font-semibold">Failed to load rules</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {error.message || "An error occurred while loading rules."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div>
          <h2 className="text-lg font-semibold">Auto-Match Rules</h2>
          <p className="text-xs text-muted-foreground">
            Rules automatically link articles to traces based on conditions
          </p>
        </div>
        <Button size="sm" onClick={() => setIsCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          New Rule
        </Button>
      </div>

      {/* Rules List */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {rules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-full bg-muted/50 p-5">
                <Zap className="h-10 w-10 text-muted-foreground/70" />
              </div>
              <h3 className="mt-6 text-base font-semibold">No rules yet</h3>
              <p className="mt-2 text-sm text-muted-foreground max-w-[280px] leading-relaxed">
                Create rules to automatically match knowledge articles to traces
                based on conditions like error type or service name.
              </p>
              <Button className="mt-4" onClick={() => setIsCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create First Rule
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {rules.map((rule) => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  onToggleEnabled={handleToggleEnabled}
                  onEdit={handleEdit}
                  onDelete={(id) => setDeletingRuleId(id)}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Create Dialog */}
      <KnowledgeRuleDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
      />

      {/* Edit Dialog */}
      {editingRule && (
        <KnowledgeRuleDialog
          open={!!editingRule}
          onOpenChange={handleCloseEdit}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          rule={editingRule}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deletingRuleId}
        onOpenChange={(open) => !open && setDeletingRuleId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Rule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this rule? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Rule data type */
interface RuleData {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  priority: number;
  scope: KnowledgeRuleScope;
  condition: unknown;
  article: { id: string; title: string; slug: string } | null;
  group: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  matchReasonTemplate: string | null;
}

/** Rule card component */
interface RuleCardProps {
  rule: RuleData;
  onToggleEnabled: (rule: RuleData, enabled: boolean) => void;
  onEdit: (rule: RuleData) => void;
  onDelete: (ruleId: string) => void;
}

function RuleCard({ rule, onToggleEnabled, onEdit, onDelete }: RuleCardProps) {
  const handleToggle = useCallback(() => {
    onToggleEnabled(rule, !rule.enabled);
  }, [onToggleEnabled, rule]);

  const handleEdit = useCallback(() => {
    onEdit(rule);
  }, [onEdit, rule]);

  const handleDelete = useCallback(() => {
    onDelete(rule.id);
  }, [onDelete, rule.id]);

  return (
    <Card
      className={cn(
        "transition-colors",
        !rule.enabled && "opacity-60"
      )}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Zap
                className={cn(
                  "h-4 w-4 shrink-0",
                  rule.enabled ? "text-yellow-500" : "text-muted-foreground"
                )}
              />
              <h3 className="font-medium text-sm truncate">{rule.name}</h3>
              <Badge
                variant="secondary"
                className={cn("text-[10px] px-1.5", SCOPE_COLORS[rule.scope])}
              >
                {rule.scope}
              </Badge>
            </div>

            {rule.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2 pl-6">
                {rule.description}
              </p>
            )}

            <div className="flex items-center gap-2 mt-2 pl-6 text-xs text-muted-foreground">
              <span>Priority: {rule.priority}</span>
              {rule.article && (
                <>
                  <span className="text-muted-foreground/50">|</span>
                  <span>Links to: {rule.article.title}</span>
                </>
              )}
              {rule.group && (
                <>
                  <span className="text-muted-foreground/50">|</span>
                  <span>Group: {rule.group.name}</span>
                </>
              )}
              {rule.project && (
                <>
                  <span className="text-muted-foreground/50">|</span>
                  <span>Project: {rule.project.name}</span>
                </>
              )}
            </div>

            {/* Condition preview */}
            <div className="mt-2 pl-6">
              <ConditionBadge condition={rule.condition} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={rule.enabled}
              onCheckedChange={handleToggle}
              aria-label={rule.enabled ? "Disable rule" : "Enable rule"}
            />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleEdit}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Eye className="mr-2 h-4 w-4" />
                  Preview Matches
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Condition badge component */
function ConditionBadge({ condition }: { condition: unknown }) {
  const cond = condition as Record<string, unknown> | null;
  if (!cond) return null;

  const operator = cond.operator as string | undefined;
  const field = cond.field as string | undefined;
  const value = cond.value as string | undefined;

  if (!operator) return null;

  let label = "";

  switch (operator) {
    case "equals":
      label = `${field} = "${value}"`;
      break;
    case "contains":
      label = `${field} contains "${value}"`;
      break;
    case "exists":
      label = `${field} exists`;
      break;
    case "gt":
      label = `${field} > ${value}`;
      break;
    case "lt":
      label = `${field} < ${value}`;
      break;
    case "regex":
      label = `${field} matches /${value}/`;
      break;
    case "and":
      label = `AND (${(cond.conditions as unknown[])?.length ?? 0} conditions)`;
      break;
    case "or":
      label = `OR (${(cond.conditions as unknown[])?.length ?? 0} conditions)`;
      break;
    case "not":
      label = "NOT condition";
      break;
    default:
      label = JSON.stringify(condition).slice(0, 50);
  }

  return (
    <Badge variant="outline" className="text-[10px] font-mono">
      {label}
    </Badge>
  );
}

/** Loading skeleton */
function RuleListSkeleton() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-3 w-48 mt-1" />
        </div>
        <Skeleton className="h-9 w-24" />
      </div>
      <div className="p-4 space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    </div>
  );
}
