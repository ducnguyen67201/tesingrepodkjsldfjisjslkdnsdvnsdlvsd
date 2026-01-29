// API Key constants
export const API_KEY_PREFIX = "ds_sk_";

// Copy feedback duration
export const COPY_TIMEOUT_MS = 2000;

// Code snippet languages
export const CODE_SNIPPET_LANGUAGES = ["curl", "python", "nodejs"] as const;
export type CodeSnippetLanguage = (typeof CODE_SNIPPET_LANGUAGES)[number];

// Code snippets for quick start
export const CODE_SNIPPETS: Record<CodeSnippetLanguage, (key: string) => string> = {
  curl: (key: string) => `curl -X POST https://api.ducsigr.com/v1/traces \\
  -H "X-API-Key: ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "my-trace", "spans": []}'`,

  python: (key: string) => `import requests

response = requests.post(
    "https://api.ducsigr.com/v1/traces",
    headers={"X-API-Key": "${key}"},
    json={"name": "my-trace", "spans": []}
)`,

  nodejs: (key: string) => `const response = await fetch("https://api.ducsigr.com/v1/traces", {
  method: "POST",
  headers: {
    "X-API-Key": "${key}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ name: "my-trace", spans: [] }),
});`,
};

// Language display names
export const CODE_SNIPPET_LABELS: Record<CodeSnippetLanguage, string> = {
  curl: "cURL",
  python: "Python",
  nodejs: "Node.js",
};
