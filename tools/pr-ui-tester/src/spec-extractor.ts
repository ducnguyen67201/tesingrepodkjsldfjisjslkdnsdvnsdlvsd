/**
 * Extract specs and context from a GitHub PR
 */

import * as fs from "fs";
import * as path from "path";
import { Octokit } from "@octokit/rest";
import { inferAffectedPages } from "./file-page-mapping.js";
import type { ExtractedSpecs } from "./types.js";

export async function extractSpecsFromPR(): Promise<ExtractedSpecs> {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const [owner, repo] = (process.env.GITHUB_REPOSITORY || "").split("/");
  const prNumber = parseInt(process.env.PR_NUMBER || "0");

  if (!owner || !repo || !prNumber) {
    throw new Error(
      "Missing required environment variables: GITHUB_REPOSITORY, PR_NUMBER"
    );
  }

  // Get PR details
  const { data: pr } = await octokit.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  // Get changed files
  const { data: files } = await octokit.pulls.listFiles({
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  });

  const changedFiles = files.map((f) => f.filename);

  // Get commits for additional context
  const { data: commits } = await octokit.pulls.listCommits({
    owner,
    repo,
    pull_number: prNumber,
  });

  const commitMessages = commits.map((c) => c.commit.message);

  // Find and read engineering spec files that were changed
  const specFiles = changedFiles.filter(
    (f) => f.includes("docs/specs") && f.endsWith(".md")
  );

  const engineeringSpecs: Array<{ path: string; content: string }> = [];

  for (const specFile of specFiles) {
    const fullPath = path.join(process.cwd(), specFile);
    if (fs.existsSync(fullPath)) {
      engineeringSpecs.push({
        path: specFile,
        content: fs.readFileSync(fullPath, "utf8"),
      });
    }
  }

  // Also check for specs linked in PR description
  const linkedSpecs = extractLinkedSpecs(pr.body || "");
  for (const linkedSpec of linkedSpecs) {
    const fullPath = path.join(process.cwd(), linkedSpec);
    if (fs.existsSync(fullPath) && !specFiles.includes(linkedSpec)) {
      engineeringSpecs.push({
        path: linkedSpec,
        content: fs.readFileSync(fullPath, "utf8"),
      });
    }
  }

  // Infer affected pages
  const affectedPages = inferAffectedPages(changedFiles);

  return {
    prNumber,
    prTitle: pr.title,
    prDescription: pr.body || "",
    changedFiles,
    affectedPages,
    engineeringSpecs,
    commitMessages,
  };
}

/**
 * Extract spec file paths linked in PR description
 * Looks for patterns like:
 * - [[/docs/specs/foo.md|Description]]
 * - See: docs/specs/foo.md
 * - Spec: /docs/specs/foo.md
 */
function extractLinkedSpecs(description: string): string[] {
  const specs: string[] = [];

  // Wiki-style links
  const wikiLinkRegex = /\[\[\/?(docs\/specs\/[^\]|]+)/g;
  let match;
  while ((match = wikiLinkRegex.exec(description)) !== null) {
    specs.push(match[1]);
  }

  // Plain text references
  const plainRefRegex =
    /(?:see|spec|ref):\s*\/?(docs\/specs\/[\w-]+\.md)/gi;
  while ((match = plainRefRegex.exec(description)) !== null) {
    specs.push(match[1]);
  }

  // Markdown links
  const mdLinkRegex = /\[.*?\]\((\/?(docs\/specs\/[^)]+))\)/g;
  while ((match = mdLinkRegex.exec(description)) !== null) {
    specs.push(match[2]);
  }

  return [...new Set(specs)];
}

/**
 * For local testing without GitHub API
 */
export function createMockSpecs(options: Partial<ExtractedSpecs>): ExtractedSpecs {
  return {
    prNumber: options.prNumber || 1,
    prTitle: options.prTitle || "Test PR",
    prDescription: options.prDescription || "",
    changedFiles: options.changedFiles || [],
    affectedPages: options.affectedPages || ["/"],
    engineeringSpecs: options.engineeringSpecs || [],
    commitMessages: options.commitMessages || [],
  };
}
