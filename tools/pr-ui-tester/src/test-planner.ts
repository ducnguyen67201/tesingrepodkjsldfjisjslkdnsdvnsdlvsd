/**
 * Claude-powered test plan generation
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedSpecs, TestPlan } from "./types.js";
import {
  isDocumentationOnly,
  isTestOnly,
  isConfigOnly,
} from "./file-page-mapping.js";

const TEST_PLANNER_PROMPT = `You are an expert QA engineer. Given information about a PR (description, changed files, affected pages, and engineering specs), generate a comprehensive test plan.

## Your Task

Generate a JSON test plan that validates the changes work correctly. Focus on:
1. User-facing functionality that changed
2. Critical paths that might be affected
3. Edge cases mentioned in specs
4. Interactive elements (buttons, forms, dialogs)

## Output Format

Return a JSON object matching this schema:
{
  "summary": "Brief description of what the test plan covers",
  "pages": [
    {
      "path": "/login",
      "description": "Test login page functionality",
      "priority": "critical",
      "actions": [
        {
          "type": "navigate",
          "description": "Navigate to login page"
        },
        {
          "type": "wait",
          "selector": "[data-testid='login-form']",
          "description": "Wait for login form to load"
        },
        {
          "type": "fill",
          "selector": "[data-testid='email-input']",
          "value": "test@example.com",
          "description": "Fill email input"
        },
        {
          "type": "screenshot",
          "description": "Capture form state"
        }
      ]
    }
  ],
  "skipReason": null
}

## Action Types

- **navigate**: Go to a page (path is used from the page object)
- **click**: Click an element
- **fill**: Fill an input with a value
- **verify**: Check an element's state (visible, hidden, contains text)
- **screenshot**: Take a screenshot at this point
- **wait**: Wait for an element to appear

## Selector Guidelines

- Prefer \`data-testid\` attributes: \`[data-testid='button-name']\`
- Use semantic selectors: \`button:has-text("Save")\`
- Use role selectors: \`role=button[name="Submit"]\`
- Avoid brittle selectors like \`.class-name-123\`

## Priority Levels

- **critical**: Core functionality, must not fail
- **high**: Important features affected by changes
- **medium**: Related functionality to verify
- **low**: Nice-to-have edge case coverage

## When to Skip

If the PR only changes:
- Documentation files (.md)
- Configuration files (not affecting UI)
- Backend-only code with no UI impact
- Test files only

Return: { "summary": "...", "pages": [], "skipReason": "Only documentation changes" }

## Important Notes

- Be conservative with actions - test real user flows
- Include wait actions before interacting with dynamic content
- Add screenshots after key state changes
- Don't test external services or auth flows in detail
- Focus on regression detection, not exhaustive testing`;

export async function generateTestPlan(
  specs: ExtractedSpecs
): Promise<TestPlan> {
  // Check for skip conditions first
  if (isDocumentationOnly(specs.changedFiles)) {
    return {
      summary: "Documentation-only changes",
      pages: [],
      skipReason: "Only documentation files were changed",
    };
  }

  if (isTestOnly(specs.changedFiles)) {
    return {
      summary: "Test-only changes",
      pages: [],
      skipReason: "Only test files were changed",
    };
  }

  if (isConfigOnly(specs.changedFiles)) {
    return {
      summary: "Configuration-only changes",
      pages: [],
      skipReason: "Only configuration files were changed",
    };
  }

  const anthropic = new Anthropic();

  // Build context for Claude
  const context = buildTestContext(specs);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: TEST_PLANNER_PROMPT,
    messages: [
      {
        role: "user",
        content: context,
      },
    ],
  });

  // Extract JSON from response
  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  // Parse JSON (handle markdown code blocks)
  const jsonMatch =
    content.text.match(/```json\n?([\s\S]*?)\n?```/) ||
    content.text.match(/(\{[\s\S]*\})/);

  if (!jsonMatch) {
    throw new Error("Failed to extract JSON from Claude response");
  }

  const testPlan = JSON.parse(jsonMatch[1]) as TestPlan;

  // Validate test plan structure
  validateTestPlan(testPlan);

  return testPlan;
}

function buildTestContext(specs: ExtractedSpecs): string {
  let context = `## PR Information

**PR #${specs.prNumber}**: ${specs.prTitle}

### Description
${specs.prDescription || "(No description provided)"}

### Changed Files (${specs.changedFiles.length} files)
${specs.changedFiles
  .slice(0, 30)
  .map((f) => `- ${f}`)
  .join("\n")}
${
  specs.changedFiles.length > 30
    ? `\n... and ${specs.changedFiles.length - 30} more files`
    : ""
}

### Affected Pages (inferred)
${
  specs.affectedPages.length > 0
    ? specs.affectedPages.map((p) => `- ${p}`).join("\n")
    : "No specific pages identified"
}
`;

  if (specs.engineeringSpecs.length > 0) {
    context += `\n### Engineering Specs\n`;
    for (const spec of specs.engineeringSpecs) {
      // Truncate very long specs
      const truncatedContent =
        spec.content.length > 3000
          ? spec.content.slice(0, 3000) + "\n... (truncated)"
          : spec.content;
      context += `\n#### ${spec.path}\n\n${truncatedContent}\n`;
    }
  }

  if (specs.commitMessages.length > 0) {
    context += `\n### Recent Commits\n`;
    context += specs.commitMessages
      .slice(0, 5)
      .map((m) => `- ${m.split("\n")[0]}`)
      .join("\n");
  }

  context += `\n\nGenerate a test plan for these changes. Focus on testing the affected pages and any new functionality described in the specs.`;

  return context;
}

function validateTestPlan(plan: TestPlan): void {
  if (!plan.summary) {
    throw new Error("Test plan missing summary");
  }

  if (!Array.isArray(plan.pages)) {
    throw new Error("Test plan pages must be an array");
  }

  for (const page of plan.pages) {
    if (!page.path) {
      throw new Error("Test plan page missing path");
    }
    if (!Array.isArray(page.actions)) {
      throw new Error(`Test plan page ${page.path} missing actions array`);
    }
    for (const action of page.actions) {
      if (!action.type) {
        throw new Error(`Action in ${page.path} missing type`);
      }
      if (!action.description) {
        throw new Error(`Action in ${page.path} missing description`);
      }
    }
  }
}
