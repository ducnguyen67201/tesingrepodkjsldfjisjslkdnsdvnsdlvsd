"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type PromptTemplate, type PromptVariable } from "@cognobserve/api/schemas";

interface PromptVariableInjectorProps {
  content: PromptTemplate;
  variables?: PromptVariable[] | null;
}

interface VariableField {
  name: string;
  required: boolean;
  defaultValue?: string;
  description?: string;
}

const PLACEHOLDER_REGEX = /\{\{(\w+)\}\}/g;

function extractVariables(content: PromptTemplate): string[] {
  const variables = new Set<string>();

  const extractFromText = (text: string) => {
    const regex = /\{\{(\w+)\}\}/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      if (match[1]) {
        variables.add(match[1]);
      }
    }
  };

  if (content.type === "text") {
    extractFromText(content.text);
    return Array.from(variables);
  }

  content.messages.forEach((message) => {
    extractFromText(message.content);
  });

  return Array.from(variables);
}

function compileTemplate(
  content: PromptTemplate,
  values: Record<string, string>
): PromptTemplate {
  const replacePlaceholders = (text: string): string => {
    return text.replace(PLACEHOLDER_REGEX, (match, varName: string) => {
      const value = values[varName];
      return value !== undefined && value !== "" ? value : match;
    });
  };

  if (content.type === "text") {
    return {
      type: "text",
      text: replacePlaceholders(content.text),
    };
  }

  return {
    type: "chat",
    messages: content.messages.map((message) => ({
      ...message,
      content: replacePlaceholders(message.content),
    })),
  };
}

function formatCompiled(content: PromptTemplate): string {
  if (content.type === "text") {
    return content.text;
  }

  return content.messages
    .map((message) => {
      const label = message.name ? `${message.role} (${message.name})` : message.role;
      return `[${label}]\n${message.content}`;
    })
    .join("\n\n");
}

export function PromptVariableInjector({
  content,
  variables,
}: PromptVariableInjectorProps) {
  const fieldId = useId();

  const variableFields = useMemo<VariableField[]>(() => {
    const names = extractVariables(content);
    if (names.length === 0) return [];

    const variableMap = new Map((variables ?? []).map((variable) => [variable.name, variable]));

    return names.map((name) => {
      const definition = variableMap.get(name);
      return {
        name,
        required: definition?.required ?? false,
        defaultValue: definition?.default,
        description: definition?.description,
      };
    });
  }, [content, variables]);

  const initialValues = useMemo(() => {
    const defaults: Record<string, string> = {};
    variableFields.forEach((field) => {
      if (field.defaultValue !== undefined) {
        defaults[field.name] = field.defaultValue;
      }
    });
    return defaults;
  }, [variableFields]);

  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    setValues(initialValues);
  }, [initialValues]);

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const name = event.currentTarget.dataset.variable;
      if (!name) return;
      const value = event.currentTarget.value;
      setValues((prev) => ({ ...prev, [name]: value }));
    },
    []
  );

  const compiled = useMemo(() => compileTemplate(content, values), [content, values]);
  const compiledPreview = useMemo(() => formatCompiled(compiled), [compiled]);

  const renderVariableField = useCallback(
    (field: VariableField) => {
      const inputId = `${fieldId}-${field.name}`;
      const value = values[field.name] ?? field.defaultValue ?? "";
      const placeholder = field.description ?? `Enter ${field.name}...`;

      return (
        <div key={field.name} className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Label htmlFor={inputId} className="text-xs">
              {field.name}
            </Label>
            {field.required ? (
              <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
                required
              </Badge>
            ) : null}
            {field.defaultValue ? (
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                default
              </Badge>
            ) : null}
          </div>
          <Input
            id={inputId}
            data-variable={field.name}
            value={value}
            onChange={handleInputChange}
            placeholder={placeholder}
            className="h-8 text-sm"
          />
          {field.description ? (
            <p className="text-[10px] text-muted-foreground">{field.description}</p>
          ) : null}
        </div>
      );
    },
    [fieldId, handleInputChange, values]
  );

  if (variableFields.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Dynamic Variables</CardTitle>
        <CardDescription className="text-xs">
          Inject values to preview the compiled prompt.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {variableFields.map(renderVariableField)}
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Compiled Preview</Label>
          <ScrollArea className="h-32">
            <pre className="whitespace-pre-wrap rounded bg-muted/50 p-2 text-xs font-mono">
              {compiledPreview}
            </pre>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}
