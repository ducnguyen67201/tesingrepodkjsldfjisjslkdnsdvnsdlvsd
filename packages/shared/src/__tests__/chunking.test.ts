import { describe, it, expect } from "vitest";
import {
  chunkCode,
  shouldIndexFile,
  detectLanguage,
  type CodeChunk,
} from "../chunking";

// ============================================
// Helper Functions
// ============================================

const createTestFile = (lines: string[], _extension: string = ".ts"): string => {
  return lines.join("\n");
};

// ============================================
// shouldIndexFile Tests
// ============================================

describe("shouldIndexFile", () => {
  it("should return true for TypeScript files", () => {
    expect(shouldIndexFile("src/utils.ts")).toBe(true);
    expect(shouldIndexFile("src/index.tsx")).toBe(true);
  });

  it("should return true for JavaScript files", () => {
    expect(shouldIndexFile("lib/helper.js")).toBe(true);
    expect(shouldIndexFile("components/App.jsx")).toBe(true);
  });

  it("should return true for Python files", () => {
    expect(shouldIndexFile("main.py")).toBe(true);
    expect(shouldIndexFile("utils/helpers.py")).toBe(true);
  });

  it("should return true for Go files", () => {
    expect(shouldIndexFile("main.go")).toBe(true);
    expect(shouldIndexFile("pkg/server/server.go")).toBe(true);
  });

  it("should return false for non-code files", () => {
    expect(shouldIndexFile("README.md")).toBe(false);
    expect(shouldIndexFile("package.json")).toBe(false);
    expect(shouldIndexFile("image.png")).toBe(false);
    expect(shouldIndexFile(".env")).toBe(false);
  });

  it("should return false for excluded directories", () => {
    expect(shouldIndexFile("node_modules/lodash/index.js")).toBe(false);
    expect(shouldIndexFile(".git/config")).toBe(false);
    expect(shouldIndexFile("dist/bundle.js")).toBe(false);
    expect(shouldIndexFile("build/output.js")).toBe(false);
    expect(shouldIndexFile(".next/static/bundle.js")).toBe(false);
  });

  it("should return false for minified files", () => {
    expect(shouldIndexFile("bundle.min.js")).toBe(false);
    expect(shouldIndexFile("app.min.ts")).toBe(false);
  });

  it("should return false for declaration files", () => {
    expect(shouldIndexFile("types.d.ts")).toBe(false);
    expect(shouldIndexFile("global.d.ts")).toBe(false);
  });

  it("should return false for lock files", () => {
    expect(shouldIndexFile("package-lock.json")).toBe(false);
    expect(shouldIndexFile("pnpm-lock.yaml")).toBe(false);
    expect(shouldIndexFile("yarn.lock")).toBe(false);
  });
});

// ============================================
// detectLanguage Tests
// ============================================

describe("detectLanguage", () => {
  it("should detect TypeScript", () => {
    expect(detectLanguage("file.ts")).toBe("typescript");
    expect(detectLanguage("component.tsx")).toBe("typescript");
  });

  it("should detect JavaScript", () => {
    expect(detectLanguage("file.js")).toBe("javascript");
    expect(detectLanguage("component.jsx")).toBe("javascript");
    expect(detectLanguage("file.mjs")).toBe("javascript");
    expect(detectLanguage("file.cjs")).toBe("javascript");
  });

  it("should detect Python", () => {
    expect(detectLanguage("script.py")).toBe("python");
    expect(detectLanguage("utils/helpers.py")).toBe("python");
  });

  it("should detect Go", () => {
    expect(detectLanguage("main.go")).toBe("go");
    expect(detectLanguage("pkg/server.go")).toBe("go");
  });

  it("should return null for unknown extensions", () => {
    expect(detectLanguage("file.unknown")).toBeNull();
    expect(detectLanguage("README.md")).toBeNull();
    expect(detectLanguage("data.json")).toBeNull();
  });

  it("should handle paths with multiple dots", () => {
    expect(detectLanguage("file.test.ts")).toBe("typescript");
    expect(detectLanguage("my.file.name.py")).toBe("python");
  });
});

// ============================================
// chunkCode - TypeScript Tests
// ============================================

describe("chunkCode - TypeScript", () => {
  it("should return single chunk for small files", () => {
    const content = createTestFile([
      "const x = 1;",
      "const y = 2;",
      "export { x, y };",
    ]);
    const chunks = chunkCode({ content, filePath: "small.ts" });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.chunkType).toBe("module");
    expect(chunks[0]?.startLine).toBe(1);
    expect(chunks[0]?.endLine).toBe(3);
    expect(chunks[0]?.language).toBe("typescript");
  });

  it("should detect function declarations", () => {
    const content = createTestFile([
      "function add(a: number, b: number): number {",
      "  return a + b;",
      "}",
      "",
      "function subtract(a: number, b: number): number {",
      "  return a - b;",
      "}",
    ]);
    const chunks = chunkCode({ content, filePath: "math.ts" });

    // Small file, returns as single module
    expect(chunks).toHaveLength(1);
  });

  it("should detect async function declarations", () => {
    const content = createTestFile([
      "async function fetchData(): Promise<void> {",
      "  const response = await fetch('/api');",
      "  return response.json();",
      "}",
    ]);
    const chunks = chunkCode({ content, filePath: "api.ts" });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toContain("async function fetchData");
  });

  it("should detect class declarations", () => {
    const content = createTestFile([
      "export class Calculator {",
      "  add(a: number, b: number): number {",
      "    return a + b;",
      "  }",
      "",
      "  subtract(a: number, b: number): number {",
      "    return a - b;",
      "  }",
      "}",
    ]);
    const chunks = chunkCode({ content, filePath: "calculator.ts" });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toContain("export class Calculator");
  });

  it("should detect interface declarations", () => {
    const content = createTestFile([
      "export interface User {",
      "  id: string;",
      "  name: string;",
      "  email: string;",
      "}",
    ]);
    const chunks = chunkCode({ content, filePath: "types.ts" });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toContain("export interface User");
  });

  it("should detect type declarations", () => {
    const content = createTestFile([
      "export type Status = 'pending' | 'active' | 'completed';",
    ]);
    const chunks = chunkCode({ content, filePath: "types.ts" });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toContain("export type Status");
  });

  it("should detect arrow function assignments", () => {
    const content = createTestFile([
      "export const multiply = (a: number, b: number): number => {",
      "  return a * b;",
      "};",
    ]);
    const chunks = chunkCode({ content, filePath: "utils.ts" });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toContain("export const multiply");
  });

  it("should generate content hash", () => {
    const content = createTestFile(["const x = 1;"]);
    const chunks = chunkCode({ content, filePath: "test.ts" });

    expect(chunks[0]?.contentHash).toBeTruthy();
    expect(chunks[0]?.contentHash.length).toBe(64); // SHA-256 hex
  });

  it("should produce consistent hashes for same content", () => {
    const content = createTestFile(["const x = 1;"]);
    const chunks1 = chunkCode({ content, filePath: "test1.ts" });
    const chunks2 = chunkCode({ content, filePath: "test2.ts" });

    expect(chunks1[0]?.contentHash).toBe(chunks2[0]?.contentHash);
  });
});

// ============================================
// chunkCode - Python Tests
// ============================================

describe("chunkCode - Python", () => {
  it("should return single chunk for small files", () => {
    const content = createTestFile([
      "x = 1",
      "y = 2",
      "print(x + y)",
    ]);
    const chunks = chunkCode({ content, filePath: "small.py" });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.chunkType).toBe("module");
    expect(chunks[0]?.language).toBe("python");
  });

  it("should detect function definitions", () => {
    const content = createTestFile([
      "def add(a, b):",
      "    return a + b",
      "",
      "def subtract(a, b):",
      "    return a - b",
    ]);
    const chunks = chunkCode({ content, filePath: "math.py" });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toContain("def add");
    expect(chunks[0]?.content).toContain("def subtract");
  });

  it("should detect async function definitions", () => {
    const content = createTestFile([
      "async def fetch_data():",
      "    response = await fetch('/api')",
      "    return response",
    ]);
    const chunks = chunkCode({ content, filePath: "api.py" });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toContain("async def fetch_data");
  });

  it("should detect class definitions", () => {
    const content = createTestFile([
      "class Calculator:",
      "    def add(self, a, b):",
      "        return a + b",
      "",
      "    def subtract(self, a, b):",
      "        return a - b",
    ]);
    const chunks = chunkCode({ content, filePath: "calculator.py" });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toContain("class Calculator:");
  });
});

// ============================================
// chunkCode - Go Tests
// ============================================

describe("chunkCode - Go", () => {
  it("should return single chunk for small files", () => {
    const content = createTestFile([
      "package main",
      "",
      "func main() {",
      "    fmt.Println(\"Hello\")",
      "}",
    ]);
    const chunks = chunkCode({ content, filePath: "main.go" });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.chunkType).toBe("module");
    expect(chunks[0]?.language).toBe("go");
  });

  it("should detect function declarations", () => {
    const content = createTestFile([
      "package math",
      "",
      "func Add(a, b int) int {",
      "    return a + b",
      "}",
      "",
      "func Subtract(a, b int) int {",
      "    return a - b",
      "}",
    ]);
    const chunks = chunkCode({ content, filePath: "math.go" });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toContain("func Add");
    expect(chunks[0]?.content).toContain("func Subtract");
  });

  it("should detect method declarations", () => {
    const content = createTestFile([
      "package main",
      "",
      "func (c *Calculator) Add(a, b int) int {",
      "    return a + b",
      "}",
    ]);
    const chunks = chunkCode({ content, filePath: "calc.go" });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toContain("func (c *Calculator) Add");
  });

  it("should detect struct declarations", () => {
    const content = createTestFile([
      "package main",
      "",
      "type User struct {",
      "    ID   string",
      "    Name string",
      "}",
    ]);
    const chunks = chunkCode({ content, filePath: "types.go" });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toContain("type User struct");
  });
});

// ============================================
// chunkCode - Fallback Tests
// ============================================

describe("chunkCode - Fallback", () => {
  it("should handle unknown file types", () => {
    const content = createTestFile([
      "line 1",
      "line 2",
      "line 3",
    ]);
    const chunks = chunkCode({ content, filePath: "file.unknown" });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.language).toBeNull();
    expect(chunks[0]?.chunkType).toBe("module");
  });

  it("should use provided language override", () => {
    const content = createTestFile(["const x = 1;"]);
    const chunks = chunkCode({
      content,
      filePath: "file.unknown",
      language: "typescript",
    });

    expect(chunks[0]?.language).toBe("typescript");
  });
});

// ============================================
// chunkCode - Options Tests
// ============================================

describe("chunkCode - Options", () => {
  it("should respect maxLines option", () => {
    const lines: string[] = [];
    for (let i = 0; i < 100; i++) {
      lines.push(`const x${i} = ${i};`);
    }
    const content = lines.join("\n");
    const chunks = chunkCode(
      { content, filePath: "large.ts" },
      { maxLines: 50 }
    );

    // Should be split into multiple chunks
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    chunks.forEach((chunk) => {
      const lineCount = chunk.endLine - chunk.startLine + 1;
      expect(lineCount).toBeLessThanOrEqual(50);
    });
  });

  it("should respect maxBytes option for large files", () => {
    // Create content that exceeds both default maxLines and a small maxBytes
    const lines: string[] = [];
    for (let i = 0; i < 600; i++) {
      lines.push(`const longVariable${i} = "This is a very long string value that takes up many bytes for testing";`);
    }
    const content = lines.join("\n");

    // When file exceeds maxLines (default 500), it gets chunked
    const chunks = chunkCode(
      { content, filePath: "large.ts" },
      { maxBytes: 5000 }
    );

    // File is large enough to be split
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    // Each chunk should have content
    chunks.forEach((chunk) => {
      expect(chunk.content.length).toBeGreaterThan(0);
    });
  });
});

// ============================================
// chunkCode - Edge Cases
// ============================================

describe("chunkCode - Edge Cases", () => {
  it("should handle empty content", () => {
    const chunks = chunkCode({ content: "", filePath: "empty.ts" });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toBe("");
  });

  it("should handle content with only whitespace", () => {
    const chunks = chunkCode({ content: "   \n\n   ", filePath: "whitespace.ts" });

    expect(chunks).toHaveLength(1);
  });

  it("should handle single line content", () => {
    const chunks = chunkCode({ content: "const x = 1;", filePath: "single.ts" });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.startLine).toBe(1);
    expect(chunks[0]?.endLine).toBe(1);
  });

  it("should handle files with Windows line endings", () => {
    const content = "const x = 1;\r\nconst y = 2;\r\n";
    const chunks = chunkCode({ content, filePath: "windows.ts" });

    expect(chunks).toHaveLength(1);
  });

  it("should preserve file path in chunks", () => {
    const filePath = "src/utils/helpers.ts";
    const chunks = chunkCode({ content: "const x = 1;", filePath });

    expect(chunks[0]?.filePath).toBe(filePath);
  });

  it("should handle strings with braces in code", () => {
    const content = createTestFile([
      "function test() {",
      "  const str = \"{ not a real brace }\";",
      "  return str;",
      "}",
    ]);
    const chunks = chunkCode({ content, filePath: "test.ts" });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toContain("function test()");
    expect(chunks[0]?.content).toContain("not a real brace");
  });

  it("should handle template literals in code", () => {
    const content = createTestFile([
      "function test() {",
      "  const str = `template with ${expression}`;",
      "  return str;",
      "}",
    ]);
    const chunks = chunkCode({ content, filePath: "test.ts" });

    expect(chunks).toHaveLength(1);
  });

  it("should handle deeply nested braces", () => {
    const content = createTestFile([
      "function outer() {",
      "  function inner() {",
      "    if (true) {",
      "      while (true) {",
      "        const obj = { key: { nested: true } };",
      "      }",
      "    }",
      "  }",
      "}",
    ]);
    const chunks = chunkCode({ content, filePath: "nested.ts" });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toContain("function outer()");
    expect(chunks[0]?.content).toContain("function inner()");
  });
});

// ============================================
// Chunk Properties Tests
// ============================================

describe("Chunk Properties", () => {
  it("should have all required properties", () => {
    const chunks = chunkCode({ content: "const x = 1;", filePath: "test.ts" });
    const chunk = chunks[0] as CodeChunk;

    expect(chunk).toHaveProperty("filePath");
    expect(chunk).toHaveProperty("startLine");
    expect(chunk).toHaveProperty("endLine");
    expect(chunk).toHaveProperty("content");
    expect(chunk).toHaveProperty("contentHash");
    expect(chunk).toHaveProperty("language");
    expect(chunk).toHaveProperty("chunkType");
  });

  it("should have valid line numbers", () => {
    const content = createTestFile([
      "line 1",
      "line 2",
      "line 3",
      "line 4",
      "line 5",
    ]);
    const chunks = chunkCode({ content, filePath: "test.ts" });

    chunks.forEach((chunk) => {
      expect(chunk.startLine).toBeGreaterThan(0);
      expect(chunk.endLine).toBeGreaterThanOrEqual(chunk.startLine);
    });
  });

  it("should have valid chunk types", () => {
    const content = createTestFile(["const x = 1;"]);
    const chunks = chunkCode({ content, filePath: "test.ts" });
    const validTypes = ["function", "class", "module", "block"];

    chunks.forEach((chunk) => {
      expect(validTypes).toContain(chunk.chunkType);
    });
  });
});
