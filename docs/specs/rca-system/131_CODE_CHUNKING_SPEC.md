# Engineering Spec: #131 Code Chunking Utility

**Story Points:** 5
**Priority:** P0
**Sprint:** Sprint 1 - Foundation
**Dependencies:** None (can be developed independently)
**Status:** ✅ **IMPLEMENTED** (via #130)

---

## Overview

Create a utility that intelligently splits code files into semantic chunks, preserving function and class boundaries. This ensures better retrieval quality for the RCA system compared to fixed-size chunking.

---

## Implementation Status

> **Note:** This functionality was implemented as part of ticket #130 (Temporal Workflow - Basic Indexing).
> The chunking module was created in `packages/shared/src/chunking/` and is fully tested.

### Acceptance Criteria

- [x] Chunks preserve function/class boundaries when possible
- [x] Handles TypeScript, JavaScript, Python, Go
- [x] Falls back to line-based chunking for unknown languages
- [x] Maximum chunk size: 500 lines or 10KB
- [x] Minimum chunk size: 10 lines (to avoid tiny fragments)
- [x] Includes metadata: filePath, startLine, endLine, language, chunkType
- [x] Content hash generated for deduplication
- [x] Unit tests for chunking logic (570 lines of tests)

---

## Technical Architecture

### Design Decision: Heuristic vs AST-Based Chunking

The original spec proposed using `@typescript-eslint/parser` for AST-based chunking. After evaluation, a **heuristic pattern-matching approach** was chosen instead:

| Approach | Pros | Cons |
|----------|------|------|
| **AST-Based** | Precise boundaries, handles edge cases | Requires full parsing, slower, more dependencies |
| **Heuristic** (chosen) | Fast, lightweight, no dependencies, handles 95% of cases | May miss complex edge cases |

The heuristic approach was selected because:
1. **Performance**: No parsing overhead for large files
2. **Simplicity**: No additional dependencies (`@typescript-eslint/parser` not needed)
3. **Reliability**: Regex patterns are deterministic and predictable
4. **Sufficient accuracy**: Handles common patterns (function/class declarations, exports)

Future enhancement: AST-based parsing can be added later if heuristic approach proves insufficient.

### Chunking Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                     Code Chunking Pipeline                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Input: { content, filePath, language? }                        │
│                          │                                       │
│                          ▼                                       │
│               ┌───────────────────┐                             │
│               │ Detect Language   │                             │
│               └─────────┬─────────┘                             │
│                         │                                        │
│         ┌───────────────┼───────────────┐                       │
│         ▼               ▼               ▼                        │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │
│  │ TypeScript  │ │   Python    │ │  Fallback   │               │
│  │  Heuristic  │ │  Heuristic  │ │ Line-Based  │               │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘               │
│         │               │               │                        │
│         └───────────────┴───────────────┘                       │
│                         │                                        │
│                         ▼                                        │
│               ┌───────────────────┐                             │
│               │ Enforce Limits    │                             │
│               │ (split large,     │                             │
│               │  merge small)     │                             │
│               └─────────┬─────────┘                             │
│                         │                                        │
│                         ▼                                        │
│               ┌───────────────────┐                             │
│               │ Generate SHA-256  │                             │
│               │ Content Hashes    │                             │
│               └─────────┬─────────┘                             │
│                         │                                        │
│                         ▼                                        │
│  Output: CodeChunk[]                                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Language Support

| Language | Extension | Strategy | Chunker File |
|----------|-----------|----------|--------------|
| TypeScript | `.ts`, `.tsx` | Heuristic | `typescript.ts` |
| JavaScript | `.js`, `.jsx`, `.mjs`, `.cjs` | Heuristic | `typescript.ts` |
| Python | `.py` | Heuristic (indentation) | `heuristic.ts` |
| Go | `.go` | Heuristic (braces) | `heuristic.ts` |
| Rust | `.rs` | Fallback | `fallback.ts` |
| Java | `.java` | Fallback | `fallback.ts` |
| Others | * | Fallback | `fallback.ts` |

---

## Implemented Files

| File | Lines | Status | Description |
|------|-------|--------|-------------|
| `packages/shared/src/chunking/types.ts` | 55 | ✅ Done | Type definitions |
| `packages/shared/src/chunking/constants.ts` | 39 | ✅ Done | Chunking constants |
| `packages/shared/src/chunking/typescript.ts` | 397 | ✅ Done | TS/JS heuristic chunker |
| `packages/shared/src/chunking/heuristic.ts` | 354 | ✅ Done | Python/Go heuristic chunker |
| `packages/shared/src/chunking/fallback.ts` | 182 | ✅ Done | Line-based fallback |
| `packages/shared/src/chunking/index.ts` | 122 | ✅ Done | Main entry point |
| `packages/shared/src/index.ts` | 8 | ✅ Done | Export chunking module |
| `packages/shared/src/__tests__/chunking.test.ts` | 570 | ✅ Done | Comprehensive tests |
| `apps/worker/src/temporal/activities/github.activities.ts` | 266 | ✅ Done | Uses shared chunking |

---

## API Reference

### Main Function: `chunkCode`

```typescript
import { chunkCode, type CodeChunk } from "@ducsigr/shared";

const chunks: CodeChunk[] = chunkCode({
  content: fileContent,
  filePath: "src/utils.ts",
  language: "typescript",  // Optional, auto-detected from path
}, {
  maxLines: 500,   // Optional, default: 500
  maxBytes: 10240, // Optional, default: 10KB
  minLines: 10,    // Optional, default: 10
});
```

### Utility Functions

```typescript
import {
  detectLanguage,
  shouldIndexFile,
  generateContentHash,
} from "@ducsigr/shared";

// Detect language from file path
detectLanguage("src/utils.ts");  // "typescript"
detectLanguage("main.py");       // "python"
detectLanguage("README.md");     // null

// Check if file should be indexed
shouldIndexFile("src/utils.ts");           // true
shouldIndexFile("node_modules/lodash.js"); // false
shouldIndexFile("dist/bundle.min.js");     // false

// Generate content hash for deduplication
generateContentHash("const x = 1;");  // "a1b2c3..." (64-char hex)
```

### Output Type

```typescript
interface CodeChunk {
  filePath: string;          // Original file path
  startLine: number;         // 1-indexed start line
  endLine: number;           // 1-indexed end line
  content: string;           // Chunk content
  contentHash: string;       // SHA-256 hash (64 hex chars)
  language: string | null;   // Detected language
  chunkType: ChunkType;      // "function" | "class" | "module" | "block"
}
```

---

## Chunking Strategies Implemented

### TypeScript/JavaScript Heuristic (`typescript.ts`)

Detects patterns:
- `function foo()` - function declarations
- `async function foo()` - async function declarations
- `const foo = () =>` - arrow function assignments
- `export const foo =` - exported arrow functions
- `class Foo` - class declarations
- `export class Foo` - exported classes
- `interface Foo` - interface declarations
- `type Foo =` - type declarations
- `enum Foo` - enum declarations
- `export default` - default exports

Special handling:
- Tracks brace matching for block boundaries
- Handles string literals containing braces
- Handles template literals
- Merges small chunks to meet minimum size

### Python Heuristic (`heuristic.ts`)

Detects patterns:
- `def foo():` - function definitions
- `async def foo():` - async function definitions
- `class Foo:` - class definitions

Special handling:
- Uses **indentation-based** block detection
- Skips comments and blank lines when tracking indentation
- Only chunks top-level definitions (indent = 0)

### Go Heuristic (`heuristic.ts`)

Detects patterns:
- `func Foo()` - function declarations
- `func (r *Receiver) Foo()` - method declarations
- `type Foo struct {` - struct declarations

Special handling:
- Uses **brace counting** for block boundaries
- Handles nested braces correctly

### Fallback Line-Based (`fallback.ts`)

For unknown languages or when heuristics fail:
- Splits on blank line boundaries when possible
- Respects max/min chunk size limits
- Assigns `chunkType: "block"` to all chunks

---

## Test Coverage

The test suite (`570 lines`) covers:

### `shouldIndexFile` Tests
- TypeScript, JavaScript, Python, Go files → `true`
- Non-code files (md, json, png, env) → `false`
- Excluded directories (node_modules, .git, dist, build, .next) → `false`
- Minified files (`.min.js`) → `false`
- Declaration files (`.d.ts`) → `false`
- Lock files → `false`

### `detectLanguage` Tests
- All supported extensions
- Files with multiple dots
- Unknown extensions → `null`

### `chunkCode` TypeScript Tests
- Small files → single "module" chunk
- Function declarations
- Async functions
- Class declarations
- Interface/type declarations
- Arrow function assignments
- Content hash generation
- Hash consistency

### `chunkCode` Python Tests
- Small files → single "module" chunk
- Function definitions
- Async function definitions
- Class definitions

### `chunkCode` Go Tests
- Small files → single "module" chunk
- Function declarations
- Method declarations
- Struct declarations

### `chunkCode` Options Tests
- `maxLines` enforcement
- `maxBytes` enforcement

### Edge Case Tests
- Empty content
- Whitespace-only content
- Single line content
- Windows line endings (`\r\n`)
- Strings with braces
- Template literals
- Deeply nested braces

---

## Constants Reference

```typescript
// packages/shared/src/chunking/constants.ts

export const CHUNK_DEFAULTS = {
  MAX_LINES: 500,
  MAX_BYTES: 10 * 1024, // 10KB
  MIN_LINES: 10,
} as const;

export const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
};

export const AST_LANGUAGES = ["typescript", "javascript"] as const;
export const HEURISTIC_LANGUAGES = ["python", "go"] as const;
```

---

## Future Enhancements

| Enhancement | Priority | Description |
|-------------|----------|-------------|
| AST-based TS/JS | Low | Use `@typescript-eslint/parser` for precise boundaries |
| Tree-sitter Python | Low | More accurate Python parsing |
| Tree-sitter Go | Low | More accurate Go parsing |
| Rust support | Medium | Add heuristic patterns for Rust |
| Java support | Medium | Add heuristic patterns for Java |
| Semantic splitting | Low | Split on logical sections, not just declarations |

---

## Usage in Worker

The chunking module is used in `apps/worker/src/temporal/activities/github.activities.ts`:

```typescript
import {
  chunkCode as sharedChunkCode,
  shouldIndexFile as sharedShouldIndexFile,
} from "@ducsigr/shared";

export async function chunkCodeFiles(
  files: FileContent[]
): Promise<CodeChunkData[]> {
  const allChunks: CodeChunkData[] = [];

  for (const file of files) {
    const chunks = sharedChunkCode({
      content: file.content,
      filePath: file.path,
    });

    for (const chunk of chunks) {
      allChunks.push({
        filePath: chunk.filePath,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        content: chunk.content,
        contentHash: chunk.contentHash,
        language: chunk.language,
        chunkType: chunk.chunkType,
      });
    }
  }

  return allChunks;
}
```

---

## Notes

- **No external parsing dependencies**: The heuristic approach requires no additional npm packages
- **Deterministic**: Same input always produces same output (important for Temporal workflows)
- **Error handling**: Falls back gracefully to line-based chunking on any error
- **Memory efficient**: Processes content in-memory without streaming (files are already fetched)
