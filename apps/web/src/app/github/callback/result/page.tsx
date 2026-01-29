"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

const ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
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

/**
 * Loading fallback for the Suspense boundary
 */
function LoadingFallback() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Loader2 className="h-16 w-16 animate-spin text-muted-foreground" />
      <p className="mt-4 text-sm text-muted-foreground">Processing...</p>
    </div>
  );
}

/**
 * Inner component that uses useSearchParams
 * Must be wrapped in Suspense boundary
 */
function GitHubCallbackResultContent() {
  const searchParams = useSearchParams();

  const success = searchParams.get("success") === "true";
  const error = searchParams.get("error");
  const repoCount = searchParams.get("repoCount");

  useEffect(() => {
    const result = success
      ? { type: "github-oauth-result", success: true, repoCount: Number(repoCount) }
      : { type: "github-oauth-result", success: false, error: error || "unknown" };

    console.log("[GitHub Result] Sending postMessage:", result);

    if (window.opener) {
      window.opener.postMessage(result, window.location.origin);

      const timeout = setTimeout(() => {
        window.close();
      }, 1500);

      return () => clearTimeout(timeout);
    }
  }, [success, error, repoCount]);

  if (success) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <CheckCircle2 className="h-16 w-16 text-green-500" />
        <h1 className="mt-4 text-xl font-semibold">GitHub Connected!</h1>
        <p className="mt-2 text-muted-foreground">
          {repoCount} repositories synced
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          This window will close automatically...
        </p>
      </div>
    );
  }

  const errorInfo = error
    ? ERROR_MESSAGES[error] || { title: "Unknown Error", description: "An unknown error occurred." }
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
 * GitHub OAuth Result Page
 *
 * This page receives the result from the API callback route and
 * communicates it to the parent window via postMessage.
 */
export default function GitHubCallbackResultPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <GitHubCallbackResultContent />
    </Suspense>
  );
}
