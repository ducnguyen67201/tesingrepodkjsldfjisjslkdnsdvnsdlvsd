"use client";

import { useEffect } from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import type { GitHubCallbackResult } from "@/lib/github-callback-service";

interface CallbackResultProps {
  result: GitHubCallbackResult;
}

/**
 * Client component that communicates the OAuth result to the parent window.
 * This component renders in the popup and sends a postMessage to the opener,
 * then closes the popup.
 */
export function CallbackResult({ result }: CallbackResultProps) {
  useEffect(() => {
    // Send result to parent window
    if (window.opener) {
      window.opener.postMessage(
        { type: "github-oauth-result", ...result },
        window.location.origin
      );

      // Close popup after a brief delay to show success/error state
      const timeout = setTimeout(() => {
        window.close();
      }, 1500);

      return () => clearTimeout(timeout);
    }
  }, [result]);

  // Render appropriate state
  if (result.success) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <CheckCircle2 className="h-16 w-16 text-green-500" />
        <h1 className="mt-4 text-xl font-semibold">GitHub Connected!</h1>
        <p className="mt-2 text-muted-foreground">
          {result.repoCount} repositories synced
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          This window will close automatically...
        </p>
      </div>
    );
  }

  // Error states
  const errorMessages: Record<NonNullable<GitHubCallbackResult["error"]>, { title: string; description: string }> = {
    cancelled: {
      title: "Connection Cancelled",
      description: "You cancelled the GitHub authorization.",
    },
    invalid_state: {
      title: "Session Expired",
      description: "Your session has expired. Please try again.",
    },
    github_api_error: {
      title: "Connection Failed",
      description: "Failed to connect to GitHub. Please try again.",
    },
    missing_installation: {
      title: "Installation Failed",
      description: "GitHub did not return installation details.",
    },
  };

  const errorInfo = result.error
    ? errorMessages[result.error]
    : { title: "Unknown Error", description: "An unknown error occurred." };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <XCircle className="h-16 w-16 text-destructive" />
      <h1 className="mt-4 text-xl font-semibold">{errorInfo.title}</h1>
      <p className="mt-2 text-muted-foreground">{errorInfo.description}</p>
      <p className="mt-4 text-sm text-muted-foreground">
        This window will close automatically...
      </p>
    </div>
  );
}

/**
 * Loading state shown while processing
 */
export function CallbackLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Loader2 className="h-16 w-16 animate-spin text-primary" />
      <h1 className="mt-4 text-xl font-semibold">Connecting GitHub...</h1>
      <p className="mt-2 text-muted-foreground">
        This may take a moment...
      </p>
    </div>
  );
}
