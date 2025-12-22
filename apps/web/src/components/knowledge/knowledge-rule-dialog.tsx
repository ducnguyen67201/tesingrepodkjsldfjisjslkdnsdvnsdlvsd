"use client";

import { useState, useCallback, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, PlayCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useKnowledgeRules, useRulePreview } from "@/hooks/use-knowledge-rules";
import { trpc } from "@/lib/trpc/client";
import type { KnowledgeRuleScope } from "@cognobserve/api/schemas";

/** Form schema - all required fields must not use .default() for proper type inference */
const ruleFormSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(100),
    description: z.string().max(500).optional(),
    enabled: z.boolean(),
    priority: z.number().min(0).max(100),
    scope: z.enum(["WORKSPACE", "PROJECT"]),
    projectId: z.string().optional(),
    articleId: z.string().optional(),
    groupId: z.string().optional(),
    matchReasonTemplate: z.string().max(200).optional(),
  })
  .refine(
    (data) => Boolean(data.articleId) || Boolean(data.groupId),
    {
      message: "Select an Article or a Group (at least one required)",
      path: ["articleId"],
    }
  )
  .refine(
    (data) => !(data.articleId && data.groupId),
    {
      message: "Select only one: Article or Group (not both)",
      path: ["groupId"],
    }
  )
  .refine((data) => data.scope !== "PROJECT" || data.projectId, {
    message: "Project is required when scope is PROJECT",
    path: ["projectId"],
  });

type RuleFormValues = z.infer<typeof ruleFormSchema>;

/** Condition types */
type ConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "exists"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "regex"
  | "and"
  | "or";

interface SimpleCondition {
  operator: Exclude<ConditionOperator, "and" | "or">;
  field: string;
  value?: string | number;
}

interface KnowledgeRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceSlug: string;
  projectId?: string;
  rule?: {
    id: string;
    name: string;
    description: string | null;
    enabled: boolean;
    priority: number;
    scope: KnowledgeRuleScope;
    condition: unknown;
    article: { id: string; title: string } | null;
    group: { id: string; name: string } | null;
    project: { id: string; name: string } | null;
    matchReasonTemplate: string | null;
  };
}

/** Available fields for conditions */
const CONDITION_FIELDS = [
  { value: "serviceName", label: "Service Name" },
  { value: "rootSpanName", label: "Root Span Name" },
  { value: "rootSpanStatusCode", label: "Status Code" },
  { value: "environment", label: "Environment" },
  { value: "errorCount", label: "Error Count" },
  { value: "durationMs", label: "Duration (ms)" },
  { value: "hasErrors", label: "Has Errors" },
] as const;

/** Available operators */
const CONDITION_OPERATORS = [
  { value: "equals", label: "Equals", needsValue: true },
  { value: "not_equals", label: "Not Equals", needsValue: true },
  { value: "contains", label: "Contains", needsValue: true },
  { value: "exists", label: "Exists", needsValue: false },
  { value: "gt", label: "Greater Than", needsValue: true },
  { value: "lt", label: "Less Than", needsValue: true },
  { value: "regex", label: "Matches Regex", needsValue: true },
] as const;

export function KnowledgeRuleDialog({
  open,
  onOpenChange,
  workspaceSlug,
  projectId,
  rule,
}: KnowledgeRuleDialogProps) {
  const isEdit = !!rule;
  const { createRule, updateRule, isCreating } = useKnowledgeRules({
    workspaceSlug,
    projectId,
  });
  const { previewRule } = useRulePreview({ workspaceSlug });

  // Condition state
  const [conditions, setConditions] = useState<SimpleCondition[]>([
    { operator: "equals", field: "serviceName", value: "" },
  ]);
  const [conditionType, setConditionType] = useState<"single" | "and" | "or">(
    "single"
  );
  const [previewResults, setPreviewResults] = useState<
    Array<{ traceId: string; serviceName: string; errorCount: number }>
  >([]);
  const [isPreviewing, setIsPreviewing] = useState(false);

  // Fetch articles for linking
  const { data: articlesData } = trpc.knowledge.listArticles.useQuery(
    { workspaceSlug, status: "PUBLISHED", limit: 50 },
    { enabled: open }
  );

  // Fetch groups for linking
  const { data: groupsData } = trpc.knowledge.listGroups.useQuery(
    { workspaceSlug, flat: true },
    { enabled: open }
  );

  // Form setup
  const form = useForm<RuleFormValues>({
    resolver: zodResolver(ruleFormSchema),
    defaultValues: {
      name: rule?.name ?? "",
      description: rule?.description ?? "",
      enabled: rule?.enabled ?? true,
      priority: rule?.priority ?? 50,
      scope: rule?.scope ?? "WORKSPACE",
      projectId: rule?.project?.id,
      articleId: rule?.article?.id,
      groupId: rule?.group?.id,
      matchReasonTemplate: rule?.matchReasonTemplate ?? "",
    },
  });

  // Parse existing condition on edit
  useEffect(() => {
    if (rule?.condition && typeof rule.condition === "object") {
      const cond = rule.condition as Record<string, unknown>;
      const operator = cond.operator;

      if (operator === "and" || operator === "or") {
        const conditions = cond.conditions;
        if (Array.isArray(conditions)) {
          setConditionType(operator);
          setConditions(
            conditions.map((c) => ({
              operator: (c as Record<string, unknown>).operator as SimpleCondition["operator"],
              field: String((c as Record<string, unknown>).field ?? "serviceName"),
              value: (c as Record<string, unknown>).value as string | number | undefined,
            }))
          );
        }
      } else if (typeof operator === "string") {
        setConditionType("single");
        setConditions([
          {
            operator: operator as SimpleCondition["operator"],
            field: String(cond.field ?? "serviceName"),
            value: cond.value as string | number | undefined,
          },
        ]);
      }
    }
  }, [rule]);

  // Build condition object
  const buildCondition = useCallback((): Record<string, unknown> => {
    // Single condition type with exactly one condition - return simple condition
    if (conditionType === "single") {
      if (conditions.length === 1) {
        const cond = conditions[0]!;
        return {
          operator: cond.operator,
          field: cond.field,
          value: cond.value,
        };
      }
      // Multiple conditions in "single" mode - use AND
      return {
        operator: "and",
        conditions: conditions.map((c) => ({
          operator: c.operator,
          field: c.field,
          value: c.value,
        })),
      };
    }
    // Compound condition (and/or)
    return {
      operator: conditionType,
      conditions: conditions.map((c) => ({
        operator: c.operator,
        field: c.field,
        value: c.value,
      })),
    };
  }, [conditionType, conditions]);

  // Submit handler
  const onSubmit = useCallback(
    async (values: RuleFormValues) => {
      const condition = buildCondition();

      if (isEdit && rule) {
        await updateRule(rule.id, {
          ...values,
          condition,
        });
      } else {
        await createRule({
          ...values,
          condition,
        });
      }

      onOpenChange(false);
      form.reset();
      setConditions([{ operator: "equals", field: "serviceName", value: "" }]);
      setConditionType("single");
    },
    [isEdit, rule, updateRule, createRule, buildCondition, onOpenChange, form]
  );

  // Add condition
  const addCondition = useCallback(() => {
    setConditions((prev) => [
      ...prev,
      { operator: "equals", field: "serviceName", value: "" },
    ]);
  }, []);

  // Remove condition
  const removeCondition = useCallback((index: number) => {
    setConditions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Update condition
  const updateCondition = useCallback(
    (index: number, updates: Partial<SimpleCondition>) => {
      setConditions((prev) =>
        prev.map((c, i) => (i === index ? { ...c, ...updates } : c))
      );
    },
    []
  );

  // Preview handler
  const handlePreview = useCallback(async () => {
    setIsPreviewing(true);
    try {
      const condition = buildCondition();
      const result = await previewRule(condition, projectId);
      setPreviewResults(result.matches);
    } catch (error) {
      console.error("Rule preview failed:", error);
      setPreviewResults([]);
    } finally {
      setIsPreviewing(false);
    }
  }, [buildCondition, previewRule, projectId]);

  const articles = articlesData?.items ?? [];
  const groups = Array.isArray(groupsData) ? groupsData : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Rule" : "Create Rule"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the rule configuration and conditions."
              : "Create a rule to automatically match articles to traces."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex-1 overflow-hidden flex flex-col"
          >
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-6 pb-4">
                {/* Basic Info */}
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Match API errors" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe when this rule should match..."
                            className="resize-none h-20"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="priority"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Priority</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              {...field}
                              onChange={(e) =>
                                field.onChange(parseInt(e.target.value) || 0)
                              }
                            />
                          </FormControl>
                          <FormDescription>
                            Higher priority rules are evaluated first
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="scope"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Scope</FormLabel>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="WORKSPACE">Workspace</SelectItem>
                              {/* TODO: Add project selector when PROJECT scope is needed */}
                              {/* <SelectItem value="PROJECT">Project</SelectItem> */}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Rules apply across the entire workspace
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="enabled"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>Enabled</FormLabel>
                          <FormDescription>
                            Enable this rule to start matching traces
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <Separator />

                {/* Conditions */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">Conditions</Label>
                    <Select
                      value={conditionType}
                      onValueChange={(v) =>
                        setConditionType(v as "single" | "and" | "or")
                      }
                    >
                      <SelectTrigger className="w-32 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single">Single</SelectItem>
                        <SelectItem value="and">All (AND)</SelectItem>
                        <SelectItem value="or">Any (OR)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    {conditions.map((condition, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30"
                      >
                        <Select
                          value={condition.field}
                          onValueChange={(v) =>
                            updateCondition(index, { field: v })
                          }
                        >
                          <SelectTrigger className="w-40 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CONDITION_FIELDS.map((f) => (
                              <SelectItem key={f.value} value={f.value}>
                                {f.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select
                          value={condition.operator}
                          onValueChange={(v) =>
                            updateCondition(index, {
                              operator: v as SimpleCondition["operator"],
                            })
                          }
                        >
                          <SelectTrigger className="w-36 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CONDITION_OPERATORS.map((op) => (
                              <SelectItem key={op.value} value={op.value}>
                                {op.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {CONDITION_OPERATORS.find(
                          (op) => op.value === condition.operator
                        )?.needsValue && (
                          <Input
                            className="flex-1 h-8"
                            placeholder="Value"
                            value={condition.value?.toString() ?? ""}
                            onChange={(e) =>
                              updateCondition(index, { value: e.target.value })
                            }
                          />
                        )}

                        {conditions.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={() => removeCondition(index)}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>

                  {conditionType !== "single" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addCondition}
                    >
                      <Plus className="mr-1.5 h-4 w-4" />
                      Add Condition
                    </Button>
                  )}

                  {/* Preview button */}
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handlePreview}
                      disabled={isPreviewing}
                    >
                      <PlayCircle className="mr-1.5 h-4 w-4" />
                      {isPreviewing ? "Testing..." : "Test Rule"}
                    </Button>
                    {previewResults.length > 0 && (
                      <Badge variant="secondary">
                        {previewResults.length} matches found
                      </Badge>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Link Target */}
                <div className="space-y-4">
                  <Label className="text-base font-semibold">Link Target</Label>
                  <p className="text-xs text-muted-foreground">
                    Choose which article or group to link when this rule matches.
                  </p>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="articleId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Article</FormLabel>
                          <Select
                            value={field.value ?? "__none__"}
                            onValueChange={(v) => {
                              const newValue = v === "__none__" ? undefined : v;
                              field.onChange(newValue);
                              // Clear groupId when article is selected
                              if (newValue) {
                                form.setValue("groupId", undefined);
                              }
                            }}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select article..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="__none__">None</SelectItem>
                              {articles.map((article) => (
                                <SelectItem key={article.id} value={article.id}>
                                  {article.title}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="groupId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Or Group</FormLabel>
                          <Select
                            value={field.value ?? "__none__"}
                            onValueChange={(v) => {
                              const newValue = v === "__none__" ? undefined : v;
                              field.onChange(newValue);
                              // Clear articleId when group is selected
                              if (newValue) {
                                form.setValue("articleId", undefined);
                              }
                            }}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select group..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="__none__">None</SelectItem>
                              {groups.map((group) => (
                                <SelectItem key={group.id} value={group.id}>
                                  {group.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="matchReasonTemplate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Match Reason Template</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Matched because service is {{serviceName}}"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Use {"{{field}}"} placeholders for dynamic values
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </ScrollArea>

            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isCreating}>
                {isCreating
                  ? isEdit
                    ? "Updating..."
                    : "Creating..."
                  : isEdit
                  ? "Update Rule"
                  : "Create Rule"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
