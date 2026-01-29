/**
 * GitHub OAuth Callback API Route
 *
 * Processes the GitHub App installation callback and redirects to a result page.
 * This route is an alternative to the server component page for popup-based flows.
 */

import { NextRequest, NextResponse } from "next/server";
import { processGitHubCallback } from "@/lib/github-callback-service";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const params = {
    installation_id: searchParams.get("installation_id") ?? undefined,
    setup_action: searchParams.get("setup_action") ?? undefined,
    state: searchParams.get("state") ?? undefined,
    error: searchParams.get("error") ?? undefined,
  };

  // Process the callback using shared service
  const result = await processGitHubCallback(params);

  // Build redirect URL with result
  const resultUrl = new URL("/github/callback/result", request.nextUrl.origin);

  if (result.success) {
    resultUrl.searchParams.set("success", "true");
    resultUrl.searchParams.set("repoCount", String(result.repoCount ?? 0));
  } else {
    resultUrl.searchParams.set("error", result.error ?? "unknown");
  }

  return NextResponse.redirect(resultUrl);
}
