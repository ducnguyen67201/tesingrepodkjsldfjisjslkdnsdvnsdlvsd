import { NextRequest } from "next/server";
import { prisma } from "@ducsigr/db";
import { verifyGitHubSignature } from "@ducsigr/api/lib/github";
import {
  GitHubPushPayloadSchema,
  GitHubPRPayloadSchema,
  type GitHubWebhookEvent,
} from "@ducsigr/api/schemas";
import { env } from "@/lib/env";
import { startGitHubIndexWorkflow, startEvalWorkflow } from "@/lib/temporal-client";
import {
  webhookSuccess,
  webhookError,
  webhookServerError,
  parseRepositoryFullName,
  SKIP_REASONS,
} from "@/lib/webhook-responses";

// GitHub webhook headers
const SIGNATURE_HEADER = "x-hub-signature-256";
const EVENT_HEADER = "x-github-event";
const DELIVERY_HEADER = "x-github-delivery";

// Supported events
const SUPPORTED_EVENTS = ["push", "pull_request"] as const;

export async function POST(req: NextRequest) {
  // 1. Check if webhook secret is configured
  if (!env.GITHUB_WEBHOOK_SECRET) {
    console.error("GITHUB_WEBHOOK_SECRET not configured");
    return webhookServerError.notConfigured();
  }

  // 2. Get required headers
  const signature = req.headers.get(SIGNATURE_HEADER);
  const event = req.headers.get(EVENT_HEADER);
  const delivery = req.headers.get(DELIVERY_HEADER);

  if (!event || !delivery) {
    return webhookError.missingHeaders();
  }

  // 3. Get raw payload for signature verification
  const rawPayload = await req.text();

  // 4. Verify signature
  if (!verifyGitHubSignature(rawPayload, signature, env.GITHUB_WEBHOOK_SECRET)) {
    console.warn("Invalid GitHub webhook signature", {
      delivery,
      event,
      ip: req.headers.get("x-forwarded-for") || "unknown",
      timestamp: new Date().toISOString(),
    });
    return webhookError.invalidSignature();
  }

  // 5. Parse payload
  let payload: unknown;
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    return webhookError.invalidJson();
  }

  // 6. Handle ping event (GitHub sends this when webhook is first created)
  if (event === "ping") {
    console.log("GitHub webhook ping received", { delivery });
    return webhookSuccess.pong();
  }

  // 7. Check if event is supported
  if (!SUPPORTED_EVENTS.includes(event as GitHubWebhookEvent)) {
    console.log("Unsupported GitHub event", { event, delivery });
    return webhookSuccess.skipped(SKIP_REASONS.EVENT_NOT_SUPPORTED);
  }

  // 8. Extract repository info based on event type
  let owner: string;
  let repo: string;

  try {
    if (event === "push") {
      const parsed = GitHubPushPayloadSchema.parse(payload);
      const repoInfo = parseRepositoryFullName(parsed.repository.full_name);
      if (!repoInfo) {
        return webhookError.invalidRepoFormat();
      }
      owner = repoInfo.owner;
      repo = repoInfo.repo;

      // Only process pushes to default branch
      const branch = parsed.ref.replace("refs/heads/", "");
      if (branch !== parsed.repository.default_branch) {
        console.log("Push to non-default branch, skipping", {
          delivery,
          branch,
          defaultBranch: parsed.repository.default_branch,
        });
        return webhookSuccess.skipped(SKIP_REASONS.NON_DEFAULT_BRANCH);
      }
    } else if (event === "pull_request") {
      const parsed = GitHubPRPayloadSchema.parse(payload);
      const repoInfo = parseRepositoryFullName(parsed.repository.full_name);
      if (!repoInfo) {
        return webhookError.invalidRepoFormat();
      }
      owner = repoInfo.owner;
      repo = repoInfo.repo;

      // Check if PR was merged - trigger eval workflows
      if (parsed.action === "closed" && parsed.pull_request.merged) {
        // Look up repository to get projectId for eval suites
        const prRepo = await prisma.gitHubRepository.findFirst({
          where: { owner, repo, enabled: true },
          select: { id: true, projectId: true },
        });

        if (prRepo?.projectId) {
          // Find enabled eval suites for this project
          const evalSuites = await prisma.evalSuite.findMany({
            where: { projectId: prRepo.projectId, enabled: true },
            select: { id: true, name: true },
          });

          if (evalSuites.length > 0) {
            const prNumber = parsed.pull_request.number;
            console.log("PR merged, starting eval workflows", {
              delivery,
              prNumber,
              suiteCount: evalSuites.length,
            });

            // Start eval workflows for each enabled suite
            for (const suite of evalSuites) {
              try {
                const workflowId = await startEvalWorkflow({
                  projectId: prRepo.projectId,
                  suiteId: suite.id,
                  triggeredBy: "pr_merge",
                  triggerRef: `PR #${prNumber}`,
                });
                console.log("Eval workflow started", {
                  delivery,
                  prNumber,
                  suiteName: suite.name,
                  workflowId,
                });
              } catch (error) {
                console.error("Failed to start eval workflow", {
                  delivery,
                  prNumber,
                  suiteId: suite.id,
                  error,
                });
              }
            }
          }
        }
      }

      // Only process opened, closed, and synchronize events
      const relevantActions = ["opened", "closed", "synchronize"];
      if (!relevantActions.includes(parsed.action)) {
        console.log("PR action not relevant, skipping", {
          delivery,
          action: parsed.action,
        });
        return webhookSuccess.skipped(SKIP_REASONS.PR_ACTION_NOT_RELEVANT);
      }
    } else {
      return webhookSuccess.skipped(SKIP_REASONS.EVENT_NOT_SUPPORTED);
    }
  } catch (error) {
    console.error("Failed to parse webhook payload", { delivery, event, error });
    return webhookError.invalidPayload();
  }

  // 9. Look up repository in database
  const githubRepo = await prisma.gitHubRepository.findFirst({
    where: { owner, repo, enabled: true },
    select: { id: true, projectId: true },
  });

  if (!githubRepo) {
    console.log("Repository not registered or not enabled", { delivery, owner, repo });
    return webhookSuccess.skipped(SKIP_REASONS.REPO_NOT_REGISTERED);
  }

  // Skip repos that haven't been linked to a project yet
  if (!githubRepo.projectId) {
    console.log("Repository not linked to project", { delivery, owner, repo });
    return webhookSuccess.skipped(SKIP_REASONS.REPO_NOT_REGISTERED);
  }

  // 10. Start Temporal workflow asynchronously
  try {
    const workflowId = await startGitHubIndexWorkflow({
      repoId: githubRepo.id,
      projectId: githubRepo.projectId,
      event: event as GitHubWebhookEvent,
      payload,
      deliveryId: delivery,
    });

    console.log("GitHub index workflow started", {
      delivery,
      event,
      owner,
      repo,
      workflowId,
    });

    return webhookSuccess.received(workflowId);
  } catch (error) {
    console.error("Failed to start workflow", { delivery, event, error });
    return webhookServerError.processingFailed();
  }
}
