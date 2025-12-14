/**
 * Seed script to create test RCA data for UI testing
 * Run from packages/db: doppler run -- npx tsx ../../scripts/seed-rca-test.ts
 */
import { prisma } from "./src/index.js";

async function main() {
  // 1. Find an existing project with an alert
  const alert = await prisma.alert.findFirst({
    include: { project: { include: { workspace: true } } },
  });

  if (!alert) {
    console.log("No alerts found. Create an alert first.");
    console.log("Go to: http://localhost:3000/{workspace}/projects/{project}/alerts/new");
    return;
  }

  console.log(`Found alert: ${alert.name} (${alert.id})`);
  console.log(`Project: ${alert.project.name}`);
  console.log(`Workspace: ${alert.project.workspace.slug}`);

  // 2. Create an AlertHistory entry
  const history = await prisma.alertHistory.create({
    data: {
      alertId: alert.id,
      value: 15.5,
      threshold: alert.threshold,
      state: "FIRING",
      previousState: "INACTIVE",
      notifiedVia: ["discord"],
    },
  });
  console.log(`Created AlertHistory: ${history.id}`);

  // 3. Create test RCA with correct LLMRCAOutputSchema structure
  const rca = await prisma.alertRCA.create({
    data: {
      alertId: alert.id,
      triggeredAt: history.triggeredAt,
      confidence: 0.85,
      suspectedCommits: ["abc123def456"],
      suspectedPRs: ["42"],
      analysisJson: {
        hypothesis: "The error rate spike is caused by a bug in the authentication middleware that fails to handle expired JWT tokens correctly.",
        confidence: 0.85,
        reasoning: "Analysis of 47 error traces shows 89% contain AuthMiddleware.validateToken failures with 'TokenExpiredError: jwt expired'. The error pattern started 15 minutes after the deployment timestamp, strongly correlating with commit abc123d that modified token validation logic.",
        rootCause: {
          category: "CODE_CHANGE",
          summary: "A recent code change to the authentication middleware introduced a regression in JWT token validation, causing expired tokens to trigger unhandled exceptions instead of graceful refresh flows.",
          evidence: [
            "89% of error traces contain AuthMiddleware.validateToken failures",
            "Error spike correlates with deployment at 14:23 UTC",
            "Common error: 'TokenExpiredError: jwt expired' in 73% of failed requests",
            "Commit abc123d modified token validation logic in auth middleware",
          ],
        },
        relatedChanges: [
          {
            changeId: "abc123def456",
            type: "commit",
            relevance: "high",
            explanation: "This commit modified the token validation logic in auth middleware, removing the fallback handler for expired tokens.",
          },
          {
            changeId: "42",
            type: "pr",
            relevance: "medium",
            explanation: "PR #42 introduced the authentication refactor that included the problematic commit.",
          },
        ],
        affectedComponents: [
          "AuthMiddleware",
          "TokenValidator",
          "UserSessionService",
          "API Gateway",
        ],
        remediation: {
          immediate: [
            "Rollback to previous deployment version v2.3.1",
            "Clear token cache to remove potentially corrupted entries",
            "Monitor error rates for 15 minutes post-rollback",
          ],
          longTerm: [
            "Add comprehensive test coverage for token expiration edge cases",
            "Implement circuit breaker pattern for auth middleware",
            "Add alerting for authentication failure rates above 5%",
            "Review and improve error handling in all authentication flows",
          ],
        },
      },
    },
  });

  console.log(`\nCreated RCA: ${rca.id}`);
  console.log(`\n✅ Test data created successfully!\n`);
  console.log(`View the RCA at:`);
  console.log(`http://localhost:3000/workspace/${alert.project.workspace.slug}/projects/${alert.projectId}/alerts/${alert.id}/rca/${rca.id}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
