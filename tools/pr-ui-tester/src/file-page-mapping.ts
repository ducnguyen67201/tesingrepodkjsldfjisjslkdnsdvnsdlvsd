/**
 * Maps changed file paths to affected pages/routes
 */

export const FILE_PAGE_MAPPING: Record<string, string[]> = {
  // Page components map directly to routes
  "apps/web/src/app": ["/"],
  "apps/web/src/app/(auth)": ["/login", "/register"],
  "apps/web/src/app/workspace": ["/workspace"],

  // Component directories map to their parent pages
  "apps/web/src/components/auth": ["/login", "/register"],
  "apps/web/src/components/dashboard": ["/workspace"],
  "apps/web/src/components/layout": ["/*"],

  // Shared components affect multiple pages
  "apps/web/src/components/shared": ["/*"],
  "apps/web/src/components/ui": ["/*"],

  // Hooks and utilities
  "apps/web/src/hooks": ["/*"],
  "apps/web/src/lib": ["/*"],

  // Server-side changes (API routes)
  "apps/web/src/server": ["/*"],
};

/**
 * Critical pages that should always be tested when shared components change
 */
export const CRITICAL_PAGES = ["/", "/login", "/workspace"];

/**
 * Infer affected pages from list of changed files
 */
export function inferAffectedPages(changedFiles: string[]): string[] {
  const pages = new Set<string>();

  for (const file of changedFiles) {
    for (const [pattern, routes] of Object.entries(FILE_PAGE_MAPPING)) {
      if (file.includes(pattern)) {
        routes.forEach((route) => pages.add(route));
      }
    }
  }

  // If wildcard present, expand to critical pages
  if (pages.has("/*")) {
    pages.delete("/*");
    CRITICAL_PAGES.forEach((page) => pages.add(page));
  }

  return Array.from(pages);
}

/**
 * Check if changes are documentation-only (should skip tests)
 */
export function isDocumentationOnly(changedFiles: string[]): boolean {
  return changedFiles.every(
    (file) =>
      file.endsWith(".md") ||
      file.endsWith(".txt") ||
      file.includes("/docs/") ||
      file.startsWith("README")
  );
}

/**
 * Check if changes are test-only (should skip UI tests)
 */
export function isTestOnly(changedFiles: string[]): boolean {
  return changedFiles.every(
    (file) =>
      file.includes("__tests__") ||
      file.includes(".test.") ||
      file.includes(".spec.") ||
      file.includes("/test/")
  );
}

/**
 * Check if changes are configuration-only
 */
export function isConfigOnly(changedFiles: string[]): boolean {
  const configPatterns = [
    ".eslintrc",
    ".prettierrc",
    "tsconfig",
    "package.json",
    "pnpm-lock",
    ".gitignore",
    "biome.json",
  ];

  return changedFiles.every((file) =>
    configPatterns.some((pattern) => file.includes(pattern))
  );
}
