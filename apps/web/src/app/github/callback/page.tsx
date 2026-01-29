import { processGitHubCallback } from "@/lib/github-callback-service";
import { CallbackResult } from "./callback-result";

interface PageProps {
  searchParams: Promise<{
    installation_id?: string;
    setup_action?: string;
    state?: string;
    error?: string;
  }>;
}

/**
 * GitHub OAuth Callback Page
 *
 * This page handles the callback from GitHub after app installation.
 * It processes the installation server-side, then renders a client
 * component that communicates the result to the parent window via postMessage.
 */
export default async function GitHubCallbackPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const result = await processGitHubCallback(params);

  return <CallbackResult result={result} />;
}
