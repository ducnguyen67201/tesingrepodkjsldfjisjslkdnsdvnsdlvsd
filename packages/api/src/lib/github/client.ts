import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";

/**
 * Create an authenticated Octokit client for a GitHub App installation.
 *
 * Requires GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY env vars.
 */
export function createAppOctokit(
  installationId: number,
  appId: string,
  privateKey: string
): Octokit {
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId,
      privateKey,
      installationId,
    },
  });
}
