/**
 * Type definitions for the PR UI Tester
 */

export interface ExtractedSpecs {
  prNumber: number;
  prTitle: string;
  prDescription: string;
  changedFiles: string[];
  affectedPages: string[];
  engineeringSpecs: Array<{
    path: string;
    content: string;
  }>;
  commitMessages: string[];
}

export interface TestAction {
  type: "navigate" | "click" | "fill" | "verify" | "screenshot" | "wait";
  selector?: string;
  value?: string;
  expected?: string;
  description: string;
}

export interface PageTest {
  path: string;
  description: string;
  priority: "critical" | "high" | "medium" | "low";
  actions: TestAction[];
}

export interface TestPlan {
  summary: string;
  pages: PageTest[];
  skipReason?: string;
}

export interface ActionResult {
  description: string;
  status: "passed" | "failed" | "skipped";
  error?: string;
  screenshot?: string;
  duration: number;
}

export interface BugEvidence {
  testName: string;
  page: string;
  steps: StepEvidence[];
  gifPath?: string;
  videoPath?: string;
  domSnapshot?: string;
  networkTrace: NetworkTraceEntry[];
  reproductionSteps: string;
  timestamp: string;
}

export interface StepEvidence {
  stepNumber: number;
  action: string;
  description: string;
  selector?: string;
  value?: string;
  screenshotPath: string;
  timestamp: number;
  consoleErrors: string[];
  status: "passed" | "failed";
  error?: string;
}

export interface NetworkTraceEntry {
  method: string;
  url: string;
  status: number;
  duration: number;
}

export interface TestResult {
  page: string;
  description: string;
  status: "passed" | "failed" | "skipped";
  actions: ActionResult[];
  consoleErrors: string[];
  networkErrors: string[];
  duration: number;
  bugEvidence?: BugEvidence;
}

export interface TestRunResult {
  startTime: string;
  endTime: string;
  totalDuration: number;
  results: TestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
}

export interface ReportOptions {
  prNumber: number;
  prTitle: string;
  baseUrl: string;
  runUrl: string;
}
