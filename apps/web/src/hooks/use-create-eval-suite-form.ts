"use client";

import { useState, useCallback } from "react";
import { useEvalSuites } from "./use-eval-suites";

// ============================================================
// Types
// ============================================================

export interface EvalPromptForm {
  id: string;
  name: string;
  content: string;
  expectedPattern?: string;
  maxLatencyMs?: number;
  required: boolean;
}

export interface EvalSuiteFormState {
  name: string;
  description: string;
  endpoint: string;
  enabled: boolean;
  prompts: EvalPromptForm[];
  latencyRegressionThreshold: number;
  errorRegressionThreshold: number;
}

export type FormErrors = Record<string, string>;

// ============================================================
// Constants
// ============================================================

const createInitialPrompt = (): EvalPromptForm => ({
  id: crypto.randomUUID(),
  name: "Test prompt",
  content: "",
  required: true,
});

const INITIAL_STATE: EvalSuiteFormState = {
  name: "",
  description: "",
  endpoint: "",
  enabled: true,
  prompts: [createInitialPrompt()],
  latencyRegressionThreshold: 1.2,
  errorRegressionThreshold: 2.0,
};

// ============================================================
// Hook
// ============================================================

interface UseCreateEvalSuiteFormOptions {
  workspaceSlug: string;
  projectId: string;
  onSuccess?: () => void;
}

export function useCreateEvalSuiteForm({
  workspaceSlug,
  projectId,
  onSuccess,
}: UseCreateEvalSuiteFormOptions) {
  const [form, setForm] = useState<EvalSuiteFormState>(INITIAL_STATE);
  const [errors, setErrors] = useState<FormErrors>({});

  const { createSuite, isCreating } = useEvalSuites({
    workspaceSlug,
    projectId,
  });

  // Field updaters
  const updateField = useCallback(
    <K extends keyof EvalSuiteFormState>(key: K, value: EvalSuiteFormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setErrors((prev) => ({ ...prev, [key]: "" }));
    },
    []
  );

  const updatePrompt = useCallback(
    (index: number, field: keyof EvalPromptForm, value: string | number | boolean) => {
      setForm((prev) => ({
        ...prev,
        prompts: prev.prompts.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
      }));
      // Clear prompt-specific error
      setErrors((prev) => ({ ...prev, [`prompt-${index}`]: "" }));
    },
    []
  );

  const addPrompt = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      prompts: [
        ...prev.prompts,
        {
          id: crypto.randomUUID(),
          name: `Prompt ${prev.prompts.length + 1}`,
          content: "",
          required: true,
        },
      ],
    }));
  }, []);

  const removePrompt = useCallback((index: number) => {
    setForm((prev) => ({
      ...prev,
      prompts: prev.prompts.filter((_, i) => i !== index),
    }));
  }, []);

  // Validation
  const validate = useCallback(() => {
    const newErrors: FormErrors = {};

    if (!form.name.trim()) {
      newErrors.name = "Name is required";
    }

    if (!form.endpoint.trim()) {
      newErrors.endpoint = "Endpoint URL is required";
    } else {
      try {
        new URL(form.endpoint);
      } catch {
        newErrors.endpoint = "Must be a valid URL";
      }
    }

    if (form.prompts.length === 0) {
      newErrors.prompts = "At least one prompt is required";
    }

    form.prompts.forEach((prompt, index) => {
      if (!prompt.content.trim()) {
        newErrors[`prompt-${index}`] = "Prompt content is required";
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form]);

  // Submit
  const handleSubmit = useCallback(async () => {
    if (!validate()) return;

    await createSuite({
      workspaceSlug,
      projectId,
      name: form.name,
      description: form.description || undefined,
      endpoint: form.endpoint,
      enabled: form.enabled,
      prompts: form.prompts,
      expectedBehaviors: [],
      latencyRegressionThreshold: form.latencyRegressionThreshold,
      errorRegressionThreshold: form.errorRegressionThreshold,
    });

    setForm(INITIAL_STATE);
    onSuccess?.();
  }, [createSuite, workspaceSlug, projectId, form, validate, onSuccess]);

  // Reset
  const reset = useCallback(() => {
    setForm(INITIAL_STATE);
    setErrors({});
  }, []);

  return {
    form,
    errors,
    isCreating,
    updateField,
    updatePrompt,
    addPrompt,
    removePrompt,
    handleSubmit,
    reset,
  };
}
