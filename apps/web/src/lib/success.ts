import { toast } from "sonner";

// ============================================================
// Generic Success Toasts
// ============================================================

/**
 * Show a success toast.
 *
 * @example
 * ```tsx
 * showSuccess("Settings saved");
 * showSuccess("Changes applied", "Your preferences have been updated.");
 * ```
 */
export function showSuccess(title: string, message?: string): void {
  toast.success(title, { description: message });
}

/**
 * Show a success toast for a created resource.
 */
export function showCreated(resourceName: string, details?: string): void {
  toast.success(`${resourceName} created`, { description: details });
}

/**
 * Show a success toast for an updated resource.
 */
export function showUpdated(resourceName: string, details?: string): void {
  toast.success(`${resourceName} updated`, { description: details });
}

/**
 * Show a success toast for a deleted/removed resource.
 */
export function showDeleted(resourceName: string, details?: string): void {
  toast.success(`${resourceName} removed`, { description: details });
}

/**
 * Show an info toast (not success, not error).
 */
export function showInfo(title: string, message?: string): void {
  toast.info(title, { description: message });
}

/**
 * Show a warning toast.
 */
export function showWarning(title: string, message?: string): void {
  toast.warning(title, { description: message });
}

// ============================================================
// Workspace Toasts
// ============================================================

export const workspaceToast = {
  created: (name: string) =>
    toast.success("Workspace created", { description: `"${name}" is ready to use.` }),

  updated: (name: string) =>
    toast.success("Workspace updated", { description: `"${name}" has been updated.` }),

  deleted: (name: string) =>
    toast.success("Workspace deleted", { description: `"${name}" has been removed.` }),
} as const;

// ============================================================
// Member Toasts
// ============================================================

export const memberToast = {
  added: (email: string) =>
    toast.success("Member added", { description: `${email} has been added to the workspace.` }),

  removed: (email: string) =>
    toast.success("Member removed", { description: `${email} has been removed from the workspace.` }),

  roleUpdated: (email: string, role: string) =>
    toast.success("Role updated", { description: `${email} is now a ${role.toLowerCase()}.` }),

  inviteSent: (email: string) =>
    toast.success("Invite sent", { description: `An invitation has been sent to ${email}.` }),
} as const;

// ============================================================
// Domain Matcher Toasts
// ============================================================

export const domainToast = {
  added: (domain: string) =>
    toast.success("Domain added", { description: `Users with @${domain} emails will be auto-added.` }),

  removed: (domain: string) =>
    toast.success("Domain removed", { description: `@${domain} is no longer an allowed domain.` }),
} as const;

// ============================================================
// Project Toasts
// ============================================================

export const projectToast = {
  created: (name: string) =>
    toast.success("Project created", { description: `"${name}" is ready to use.` }),

  updated: (name: string) =>
    toast.success("Project updated", { description: `"${name}" has been updated.` }),

  deleted: (name: string) =>
    toast.success("Project deleted", { description: `"${name}" has been removed.` }),
} as const;

// ============================================================
// Prompt Toasts
// ============================================================

export const promptToast = {
  created: (name: string) =>
    toast.success("Prompt created", { description: `"${name}" is ready.` }),

  updated: (name: string) =>
    toast.success("Prompt updated", { description: `"${name}" has been updated.` }),

  deleted: (name?: string) =>
    toast.success("Prompt deleted", { description: name ? `"${name}" has been removed.` : undefined }),

  archived: (name?: string) =>
    toast.success("Prompt archived", { description: name ? `"${name}" has been archived.` : undefined }),

  restored: (name?: string) =>
    toast.success("Prompt restored", { description: name ? `"${name}" has been restored.` : undefined }),

  versionCreated: (version: number) =>
    toast.success("Version created", { description: `Version ${version} is ready.` }),

  labelSet: (label: string) =>
    toast.success("Label set", { description: `Version is now "${label}".` }),

  imported: (created: number, updated: number, skipped: number) =>
    toast.success("Import complete", {
      description: `${created} created, ${updated} updated, ${skipped} skipped`,
    }),

  exported: () =>
    toast.success("Export complete", { description: "Prompts downloaded successfully." }),
} as const;

// ============================================================
// API Key Toasts
// ============================================================

export const apiKeyToast = {
  created: (name: string) =>
    toast.success("API key created", { description: `"${name}" is ready to use. Copy it now - it won't be shown again.` }),

  revoked: (name: string) =>
    toast.success("API key revoked", { description: `"${name}" has been permanently revoked.` }),

  copied: () =>
    toast.success("Copied", { description: "API key copied to clipboard." }),
} as const;

// ============================================================
// Auth Toasts
// ============================================================

export const authToast = {
  signedIn: () =>
    toast.success("Welcome back", { description: "You have been signed in." }),

  signedOut: () =>
    toast.success("Signed out", { description: "You have been signed out." }),

  passwordChanged: () =>
    toast.success("Password changed", { description: "Your password has been updated." }),
} as const;

// ============================================================
// Clipboard Toasts
// ============================================================

export const clipboardToast = {
  copied: (what?: string) =>
    toast.success("Copied", { description: what ? `${what} copied to clipboard.` : "Copied to clipboard." }),

  copyFailed: () =>
    toast.error("Copy failed", { description: "Could not copy to clipboard." }),
} as const;

// ============================================================
// Alert Toasts
// ============================================================

// ============================================================
// GitHub Toasts
// ============================================================

export const githubToast = {
  connected: (repoCount: number) =>
    toast.success("GitHub Connected", {
      description: `${repoCount} ${repoCount === 1 ? "repository" : "repositories"} synced successfully.`,
    }),

  disconnected: () =>
    toast.success("GitHub Disconnected", {
      description: "GitHub integration has been removed from this workspace.",
    }),

  repositoryEnabled: (name: string) =>
    toast.success("Repository Enabled", {
      description: `"${name}" is now being indexed.`,
    }),

  repositoryDisabled: (name: string) =>
    toast.success("Repository Disabled", {
      description: `"${name}" indexing has been stopped.`,
    }),
} as const;

// ============================================================
// Alert Toasts
// ============================================================

export const alertToast = {
  created: (name: string) =>
    toast.success("Alert created", { description: `"${name}" is now monitoring your project.` }),

  updated: (name?: string) =>
    toast.success("Alert updated", { description: name ? `"${name}" has been updated.` : undefined }),

  deleted: (name?: string) =>
    toast.success("Alert deleted", { description: name ? `"${name}" has been removed.` : undefined }),

  channelAdded: (provider: string) =>
    toast.success(`${provider} channel added`, { description: "You will receive notifications on this channel." }),

  testSent: (successCount?: number, totalCount?: number) => {
    if (successCount !== undefined && totalCount !== undefined) {
      toast.success("Test notifications sent", {
        description: `${successCount}/${totalCount} channels received the test notification.`,
      });
    } else {
      toast.success("Test notification sent", { description: "Check your notification channel." });
    }
  },

  dryRunComplete: (wouldTrigger: boolean, currentValue: number, threshold: number) =>
    toast.info("Dry run complete", {
      description: wouldTrigger
        ? `Alert would trigger. Current value: ${currentValue}, Threshold: ${threshold}`
        : `Alert would not trigger. Current value: ${currentValue}, Threshold: ${threshold}`,
    }),

  rcaStarted: () =>
    toast.success("RCA Analysis Started", {
      description: "You'll be notified when the analysis is complete.",
    }),

  rcaCompleted: (confidence?: number) =>
    toast.success("RCA Analysis Complete", {
      description: confidence
        ? `Analysis completed with ${Math.round(confidence * 100)}% confidence.`
        : "Root cause analysis is now available.",
    }),

  rcaExists: () =>
    toast.info("RCA Already Available", {
      description: "Click 'View RCA' to see the analysis.",
    }),
} as const;

// ============================================================
// RCA Toasts
// ============================================================

export const rcaToast = {
  feedbackSubmitted: () =>
    toast.success("Feedback submitted", { description: "Thank you for helping improve our RCA system." }),

  promptCopied: () =>
    toast.success("Fix prompt copied", { description: "Paste it into your AI coding assistant." }),
} as const;
