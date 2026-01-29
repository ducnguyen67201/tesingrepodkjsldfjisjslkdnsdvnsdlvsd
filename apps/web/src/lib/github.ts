/**
 * GitHub App utility functions for OAuth installation flow
 */

import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { env } from "./env";

/**
 * Check if GitHub App is configured with required environment variables
 */
export function isGitHubAppConfigured(): boolean {
  return Boolean(
    env.GITHUB_APP_ID &&
      env.GITHUB_APP_NAME &&
      env.GITHUB_APP_PRIVATE_KEY
  );
}

/**
 * Get the secret used for signing OAuth state tokens
 * Falls back to NEXTAUTH_SECRET if GITHUB_STATE_SECRET is not set
 */
export function getStateSecret(): string {
  return env.GITHUB_STATE_SECRET ?? env.NEXTAUTH_SECRET;
}

/**
 * Create an authenticated Octokit client for a GitHub App installation
 *
 * @param installationId - The GitHub App installation ID
 * @returns Authenticated Octokit client
 */
export function createAppOctokit(installationId: number): Octokit {
  if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY) {
    throw new Error("GitHub App is not configured");
  }

  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: env.GITHUB_APP_ID,
      privateKey: env.GITHUB_APP_PRIVATE_KEY,
      installationId,
    },
  });
}

/**
 * Installation details from GitHub API
 */
export interface GitHubInstallationDetails {
  id: number;
  accountLogin: string;
  accountType: "User" | "Organization";
}

/**
 * Fetch installation details from GitHub API
 *
 * @param installationId - The GitHub App installation ID
 * @returns Installation details
 */
export async function fetchInstallationDetails(
  installationId: number
): Promise<GitHubInstallationDetails> {
  const octokit = createAppOctokit(installationId);

  const { data: installation } = await octokit.apps.getInstallation({
    installation_id: installationId,
  });

  // Handle both User and Enterprise account types from GitHub API
  const account = installation.account;
  let accountLogin = "unknown";
  let accountType: "User" | "Organization" = "User";

  if (account && "login" in account) {
    // User or Organization account
    accountLogin = account.login;
    accountType = (account.type as "User" | "Organization") ?? "User";
  } else if (account && "slug" in account) {
    // Enterprise account
    accountLogin = account.slug;
    accountType = "Organization";
  }

  return {
    id: installation.id,
    accountLogin,
    accountType,
  };
}

/**
 * Repository data from GitHub API
 */
export interface GitHubRepositoryData {
  githubId: number;
  owner: string;
  repo: string;
  fullName: string;
  defaultBranch: string;
  isPrivate: boolean;
}

/**
 * Fetch all accessible repositories for an installation
 * Handles pagination for installations with >100 repos
 *
 * @param installationId - The GitHub App installation ID
 * @returns Array of repository data
 */
export async function fetchAccessibleRepositories(
  installationId: number
): Promise<GitHubRepositoryData[]> {
  const octokit = createAppOctokit(installationId);
  const repositories: GitHubRepositoryData[] = [];

  // Paginate through all accessible repositories
  let page = 1;
  const perPage = 100;

  while (true) {
    const { data } = await octokit.apps.listReposAccessibleToInstallation({
      per_page: perPage,
      page,
    });

    const repos = data.repositories;
    if (repos.length === 0) break;

    for (const repo of repos) {
      repositories.push({
        githubId: repo.id,
        owner: repo.owner.login,
        repo: repo.name,
        fullName: repo.full_name,
        defaultBranch: repo.default_branch ?? "main",
        isPrivate: repo.private,
      });
    }

    // Check if we've fetched all repos
    if (repos.length < perPage) break;
    page++;
  }

  return repositories;
}

/**
 * Get the GitHub App installation URL
 *
 * @param state - The signed state token
 * @returns Full URL to GitHub App installation page
 */
export function getInstallationUrl(state: string): string {
  if (!env.GITHUB_APP_NAME) {
    throw new Error("GITHUB_APP_NAME is not configured");
  }

  const installUrl = new URL(
    `https://github.com/apps/${env.GITHUB_APP_NAME}/installations/new`
  );
  installUrl.searchParams.set("state", state);

  return installUrl.toString();
}
