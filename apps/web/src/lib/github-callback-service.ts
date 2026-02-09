/**
 * GitHub OAuth Callback Service
 *
 * Shared logic for processing GitHub App installation callbacks.
 * Used by both the API route and the server component page.
 */

import { jwtVerify } from "jose";
import { prisma } from "@ducsigr/db";
import {
  getStateSecret,
  fetchInstallationDetails,
  fetchAccessibleRepositories,
} from "@/lib/github";

/**
 * State token payload from the install route
 */
export interface GitHubStatePayload {
  workspaceId: string;
  workspaceSlug: string;
  userId: string;
  nonce: string;
}

/**
 * Result of processing the GitHub callback
 */
export interface GitHubCallbackResult {
  success: boolean;
  error?: "cancelled" | "invalid_state" | "github_api_error" | "missing_installation";
  errorDetail?: string;
  repoCount?: number;
}

/**
 * Input parameters for processing the callback
 */
export interface GitHubCallbackParams {
  installation_id?: string;
  setup_action?: string;
  state?: string;
  error?: string;
}

/**
 * Process the GitHub OAuth callback and sync repositories.
 *
 * This function:
 * 1. Validates the state token (CSRF protection) - for new installs
 * 2. For updates (setup_action=update), finds existing installation
 * 3. Fetches installation details from GitHub API
 * 4. Fetches accessible repositories
 * 5. Stores installation and repositories in database
 */
export async function processGitHubCallback(
  params: GitHubCallbackParams
): Promise<GitHubCallbackResult> {
  const { installation_id, setup_action, state, error } = params;

  // 1. Handle user cancellation
  if (error === "access_denied") {
    return { success: false, error: "cancelled" };
  }

  // 2. Validate installation_id
  if (!installation_id) {
    return { success: false, error: "missing_installation" };
  }

  const installationId = Number(installation_id);

  // 3. Handle setup_action=update (user modified repo access on GitHub)
  // In this case, there's no state token - find existing installation
  if (setup_action === "update") {
    return processInstallationUpdate(installationId);
  }

  // 4. For new installs, validate state token
  if (!state) {
    return { success: false, error: "invalid_state" };
  }

  let payload: GitHubStatePayload;
  try {
    const stateSecret = new TextEncoder().encode(getStateSecret());
    const { payload: verified } = await jwtVerify(state, stateSecret);
    payload = verified as unknown as GitHubStatePayload;
  } catch {
    return { success: false, error: "invalid_state" };
  }

  // 5. Fetch installation details and repositories from GitHub
  let installationDetails;
  let repositories;

  try {
    installationDetails = await fetchInstallationDetails(installationId);
    repositories = await fetchAccessibleRepositories(installationId);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[GitHub Callback] GitHub API error:", errorMessage, err);
    return { success: false, error: "github_api_error", errorDetail: errorMessage };
  }

  // 6. Store installation in database (upsert to handle re-installs)
  try {
    const dbInstallation = await prisma.gitHubInstallation.upsert({
      where: { workspaceId: payload.workspaceId },
      create: {
        workspaceId: payload.workspaceId,
        installationId: BigInt(installationId),
        accountLogin: installationDetails.accountLogin,
        accountType: installationDetails.accountType,
      },
      update: {
        installationId: BigInt(installationId),
        accountLogin: installationDetails.accountLogin,
        accountType: installationDetails.accountType,
      },
    });

    // 6. Sync repositories (upsert each)
    for (const repo of repositories) {
      await prisma.gitHubRepository.upsert({
        where: { githubId: BigInt(repo.githubId) },
        create: {
          installationId: dbInstallation.id,
          githubId: BigInt(repo.githubId),
          owner: repo.owner,
          repo: repo.repo,
          fullName: repo.fullName,
          defaultBranch: repo.defaultBranch,
          isPrivate: repo.isPrivate,
          enabled: false, // User must explicitly enable
        },
        update: {
          installationId: dbInstallation.id,
          owner: repo.owner,
          repo: repo.repo,
          fullName: repo.fullName,
          defaultBranch: repo.defaultBranch,
          isPrivate: repo.isPrivate,
          // Don't update enabled status on re-install
        },
      });
    }

    return { success: true, repoCount: repositories.length };
  } catch (err) {
    console.error("[GitHub Callback] Database error:", err);
    return { success: false, error: "github_api_error" };
  }
}

/**
 * Process an installation update (user modified repo access on GitHub).
 *
 * This is called when setup_action=update, which happens when:
 * - User adds/removes repository access in GitHub settings
 * - No state token is present (not a new OAuth flow)
 *
 * If no existing installation record is found (e.g., user re-installed the app
 * or the DB was reset), this function will attempt to find the workspace from
 * the installation details and create the record.
 */
async function processInstallationUpdate(
  installationId: number
): Promise<GitHubCallbackResult> {
  console.log("[GitHub Callback] Processing installation update:", installationId);

  // 1. Find existing installation in database
  let existingInstallation = await prisma.gitHubInstallation.findUnique({
    where: { installationId: BigInt(installationId) },
  });

  // 2. If no existing installation, try to recover by creating one
  if (!existingInstallation) {
    console.warn(
      "[GitHub Callback] No existing installation for update, attempting recovery:",
      installationId
    );

    try {
      const details = await fetchInstallationDetails(installationId);

      // Find a workspace that doesn't already have a GitHub installation
      // This is a best-effort recovery — associate with the first available workspace
      const workspace = await prisma.workspace.findFirst({
        where: {
          githubInstallation: null,
        },
        select: { id: true },
      });

      if (!workspace) {
        console.error("[GitHub Callback] No available workspace for orphaned installation");
        return { success: false, error: "missing_installation" };
      }

      existingInstallation = await prisma.gitHubInstallation.create({
        data: {
          workspaceId: workspace.id,
          installationId: BigInt(installationId),
          accountLogin: details.accountLogin,
          accountType: details.accountType,
        },
      });

      console.log(
        "[GitHub Callback] Recovered installation for workspace:",
        workspace.id
      );
    } catch (err) {
      console.error("[GitHub Callback] Recovery failed:", err);
      return { success: false, error: "missing_installation" };
    }
  }

  // 3. Fetch updated repository list from GitHub
  let repositories;
  try {
    repositories = await fetchAccessibleRepositories(installationId);
  } catch (err) {
    console.error("[GitHub Callback] GitHub API error:", err);
    return { success: false, error: "github_api_error" };
  }

  // 4. Sync repositories (upsert each, preserving enabled status)
  try {
    const currentRepoIds = new Set<bigint>();

    for (const repo of repositories) {
      const repoId = BigInt(repo.githubId);
      currentRepoIds.add(repoId);

      await prisma.gitHubRepository.upsert({
        where: { githubId: repoId },
        create: {
          installationId: existingInstallation.id,
          githubId: repoId,
          owner: repo.owner,
          repo: repo.repo,
          fullName: repo.fullName,
          defaultBranch: repo.defaultBranch,
          isPrivate: repo.isPrivate,
          enabled: false,
        },
        update: {
          owner: repo.owner,
          repo: repo.repo,
          fullName: repo.fullName,
          defaultBranch: repo.defaultBranch,
          isPrivate: repo.isPrivate,
          // Preserve enabled status
        },
      });
    }

    // 5. Remove repos that are no longer accessible (user revoked access)
    const allRepos = await prisma.gitHubRepository.findMany({
      where: { installationId: existingInstallation.id },
      select: { id: true, githubId: true },
    });

    for (const repo of allRepos) {
      if (!currentRepoIds.has(repo.githubId)) {
        // Delete chunks first (foreign key constraint)
        await prisma.codeChunk.deleteMany({ where: { repoId: repo.id } });
        await prisma.gitHubRepository.delete({ where: { id: repo.id } });
      }
    }

    console.log("[GitHub Callback] Updated repositories:", repositories.length);
    return { success: true, repoCount: repositories.length };
  } catch (err) {
    console.error("[GitHub Callback] Database error:", err);
    return { success: false, error: "github_api_error" };
  }
}
