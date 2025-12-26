# Brand Rename Plan: Ducsigr → Ducsigr

## Summary

Comprehensive rebranding of the entire platform from "Ducsigr" to "Ducsigr". This affects all codebase, SDK, documentation, configuration, and public-facing elements.

---

## Scope Analysis

### Brand Name Variants to Replace

| Pattern | Replace With |
|---------|--------------|
| `Ducsigr` | `Ducsigr` |
| `ducsigr` | `ducsigr` |
| `DUCSIGR` | `DUCSIGR` |
| `@ducsigr/*` | `@ducsigr/*` |
| `ducsigr.com` | `ducsigr.com` |

### Affected Areas

- **440+ files** contain "ducsigr" references
- **Package names** in all workspaces
- **SDK** - public npm package name and exports
- **Proto files** - package names and paths
- **Docker images** - names and labels
- **Environment variables** - prefixes
- **API endpoints** - URLs
- **Documentation** - all references
- **Marketing site** - branding

---

## Execution Plan

```json
{
  "feature": "Rebrand Ducsigr to Ducsigr",
  "summary": "Complete platform rebranding from Ducsigr to Ducsigr across all code, packages, and documentation",

  "categories": [
    {
      "category": "1. Package Names (High Priority)",
      "description": "Update all package.json files with new scope",
      "files": [
        {
          "file": "package.json",
          "changes": [
            "name: ducsigr → ducsigr",
            "description: keep content, update name reference"
          ]
        },
        {
          "file": "packages/sdk/package.json",
          "changes": [
            "name: @ducsigr/sdk → @ducsigr/sdk",
            "description: Ducsigr SDK → Ducsigr SDK",
            "author: Ducsigr → Ducsigr",
            "keywords: ducsigr → ducsigr",
            "repository.url: ducsigr/ducsigr → ducsigr/ducsigr"
          ]
        },
        {
          "file": "packages/api/package.json",
          "changes": [
            "name: @ducsigr/api → @ducsigr/api",
            "dependencies: update all @ducsigr/* → @ducsigr/*"
          ]
        },
        {
          "file": "packages/db/package.json",
          "changes": [
            "name: @ducsigr/db → @ducsigr/db"
          ]
        },
        {
          "file": "packages/shared/package.json",
          "changes": [
            "name: @ducsigr/shared → @ducsigr/shared"
          ]
        },
        {
          "file": "packages/proto/package.json",
          "changes": [
            "name: @ducsigr/proto → @ducsigr/proto"
          ]
        },
        {
          "file": "packages/config-eslint/package.json",
          "changes": [
            "name: @ducsigr/config-eslint → @ducsigr/config-eslint"
          ]
        },
        {
          "file": "packages/config-typescript/package.json",
          "changes": [
            "name: @ducsigr/config-typescript → @ducsigr/config-typescript"
          ]
        },
        {
          "file": "apps/web/package.json",
          "changes": [
            "name: @ducsigr/web → @ducsigr/web",
            "dependencies: update all @ducsigr/* → @ducsigr/*"
          ]
        },
        {
          "file": "apps/worker/package.json",
          "changes": [
            "name: @ducsigr/worker → @ducsigr/worker",
            "dependencies: update all @ducsigr/* → @ducsigr/*"
          ]
        },
        {
          "file": "apps/ingest-node/package.json",
          "changes": [
            "name: @ducsigr/ingest-node → @ducsigr/ingest-node",
            "dependencies: update all @ducsigr/* → @ducsigr/*"
          ]
        },
        {
          "file": "apps/ingest-demo/package.json",
          "changes": [
            "name: @ducsigr/ingest-demo → @ducsigr/ingest-demo"
          ]
        },
        {
          "file": "apps/marketing/package.json",
          "changes": [
            "name: @ducsigr/marketing → @ducsigr/marketing"
          ]
        }
      ]
    },
    {
      "category": "2. SDK Core (High Priority - Public API)",
      "description": "Update SDK class names and exports",
      "files": [
        {
          "file": "packages/sdk/src/ducsigr.ts",
          "rename": "packages/sdk/src/ducsigr.ts",
          "changes": [
            "class DucsigrClient → class DucsigClient",
            "export const Ducsigr → export const Ducsigr",
            "All console.log('[Ducsigr]' → '[Ducsigr]'",
            "Error messages: Ducsigr → Ducsigr"
          ]
        },
        {
          "file": "packages/sdk/src/index.ts",
          "changes": [
            "Export from './ducsigr' instead of './ducsigr'"
          ]
        },
        {
          "file": "packages/sdk/src/types.ts",
          "changes": [
            "DucsigrConfig → DucsigConfig"
          ]
        },
        {
          "file": "packages/sdk/src/config.ts",
          "changes": [
            "DUCSIGR_API_KEY → DUCSIGR_API_KEY",
            "DUCSIGR_DISABLED → DUCSIGR_DISABLED",
            "DUCSIGR_ENDPOINT → DUCSIGR_ENDPOINT",
            "DUCSIGR_DEBUG → DUCSIGR_DEBUG",
            "ingest.ducsigr.com → ingest.ducsigr.com",
            "All console messages: Ducsigr → Ducsigr"
          ]
        },
        {
          "file": "packages/sdk/src/transport.ts",
          "changes": [
            "User-Agent: ducsigr-sdk → ducsigr-sdk"
          ]
        },
        {
          "file": "packages/sdk/src/log-transport.ts",
          "changes": [
            "Update any Ducsigr references"
          ]
        },
        {
          "file": "packages/sdk/src/prompts.ts",
          "changes": [
            "Console messages: Ducsigr → Ducsigr"
          ]
        },
        {
          "file": "packages/sdk/src/logger.ts",
          "changes": [
            "Console messages: Ducsigr → Ducsigr"
          ]
        },
        {
          "file": "packages/sdk/README.md",
          "changes": [
            "All branding: Ducsigr → Ducsigr",
            "Import examples: @ducsigr/sdk → @ducsigr/sdk"
          ]
        },
        {
          "file": "packages/sdk/examples/*.ts",
          "changes": [
            "All imports and comments"
          ]
        },
        {
          "file": "packages/sdk/tests/*.test.ts",
          "changes": [
            "All imports and test descriptions"
          ]
        }
      ]
    },
    {
      "category": "3. Proto Files (High Priority)",
      "description": "Rename protobuf package and directory",
      "files": [
        {
          "directory": "proto/ducsigr/",
          "rename": "proto/ducsigr/",
          "changes": [
            "Directory rename: ducsigr → ducsigr"
          ]
        },
        {
          "file": "proto/ducsigr/v1/common.proto",
          "changes": [
            "package ducsigr.v1 → package ducsigr.v1",
            "go_package: ducsigr → ducsigr"
          ]
        },
        {
          "file": "proto/ducsigr/v1/trace.proto",
          "changes": [
            "package ducsigr.v1 → package ducsigr.v1",
            "import: ducsigr/v1 → ducsigr/v1",
            "go_package: ducsigr → ducsigr"
          ]
        },
        {
          "file": "proto/ducsigr/v1/ingest.proto",
          "changes": [
            "package ducsigr.v1 → package ducsigr.v1",
            "import: ducsigr/v1 → ducsigr/v1",
            "go_package: ducsigr → ducsigr"
          ]
        },
        {
          "file": "packages/proto/src/generated/*",
          "changes": [
            "Regenerate after proto changes",
            "Directory: ducsigr/v1 → ducsigr/v1"
          ]
        },
        {
          "file": "packages/proto/src/index.ts",
          "changes": [
            "Import paths: ducsigr/v1 → ducsigr/v1"
          ]
        },
        {
          "file": "buf.yaml",
          "changes": [
            "Update if contains ducsigr references"
          ]
        }
      ]
    },
    {
      "category": "4. Shared Constants & Utilities",
      "description": "Update core constants and Redis keys",
      "files": [
        {
          "file": "packages/shared/src/constants.ts",
          "changes": [
            "APP_NAME: 'Ducsigr' → 'Ducsigr'",
            "QUEUE_KEYS.TRACES: 'ducsigr:traces' → 'ducsigr:traces'",
            "QUEUE_KEYS.SPANS: 'ducsigr:spans' → 'ducsigr:spans'",
            "QUEUE_KEYS.DEAD_LETTER: 'ducsigr:dlq' → 'ducsigr:dlq'",
            "TEMPORAL.DEFAULT_TASK_QUEUE: 'ducsigr-tasks' → 'ducsigr-tasks'"
          ]
        },
        {
          "file": "packages/shared/src/llm/*.ts",
          "changes": [
            "Any branding references"
          ]
        }
      ]
    },
    {
      "category": "5. Web App Frontend",
      "description": "Update all frontend references",
      "files": [
        {
          "file": "apps/web/src/lib/constants/api-keys.ts",
          "changes": [
            "API_KEY_PREFIX: 'co_sk_' → 'ds_sk_' (optional, discuss with user)",
            "CODE_SNIPPETS URLs: api.ducsigr.com → api.ducsigr.com"
          ]
        },
        {
          "file": "apps/web/src/app/layout.tsx",
          "changes": [
            "Metadata title: Ducsigr → Ducsigr",
            "Description updates"
          ]
        },
        {
          "file": "apps/web/src/components/**/*.tsx",
          "changes": [
            "All branding in UI text and comments"
          ]
        },
        {
          "file": "apps/web/tsconfig.json",
          "changes": [
            "Path aliases if any reference @ducsigr"
          ]
        },
        {
          "file": "apps/web/next.config.ts",
          "changes": [
            "Any domain references"
          ]
        }
      ]
    },
    {
      "category": "6. Worker App",
      "description": "Update worker references",
      "files": [
        {
          "file": "apps/worker/src/**/*.ts",
          "changes": [
            "Import paths: @ducsigr/* → @ducsigr/*"
          ]
        },
        {
          "file": "apps/worker/tsconfig.json",
          "changes": [
            "Path references"
          ]
        }
      ]
    },
    {
      "category": "7. Ingest Service",
      "description": "Update ingest node references",
      "files": [
        {
          "file": "apps/ingest-node/src/**/*.ts",
          "changes": [
            "Import paths: @ducsigr/* → @ducsigr/*"
          ]
        },
        {
          "file": "apps/ingest-node/Dockerfile",
          "changes": [
            "Image name: ducsigr-ingest → ducsigr-ingest"
          ]
        }
      ]
    },
    {
      "category": "8. Marketing Site",
      "description": "Update all marketing content",
      "files": [
        {
          "file": "apps/marketing/src/lib/constants.ts",
          "changes": [
            "SOCIAL_LINKS: twitter/github/linkedin ducsigr → ducsigr"
          ]
        },
        {
          "file": "apps/marketing/src/app/layout.tsx",
          "changes": [
            "Metadata: Ducsigr → Ducsigr"
          ]
        },
        {
          "file": "apps/marketing/src/components/**/*.tsx",
          "changes": [
            "All branding text"
          ]
        }
      ]
    },
    {
      "category": "9. Docker & Infrastructure",
      "description": "Update Docker and deployment configs",
      "files": [
        {
          "file": "docker-compose.yml",
          "changes": [
            "Service names if prefixed with ducsigr",
            "Image names"
          ]
        },
        {
          "file": "docker-compose.self-hosted.yml",
          "changes": [
            "Same as above"
          ]
        },
        {
          "file": "Dockerfile.app",
          "changes": [
            "Labels and image references"
          ]
        },
        {
          "file": "Dockerfile.quickstart",
          "changes": [
            "Labels and image references"
          ]
        },
        {
          "file": "Makefile",
          "changes": [
            "Any ducsigr references"
          ]
        },
        {
          "file": ".env.example",
          "changes": [
            "DUCSIGR_* → DUCSIGR_*"
          ]
        },
        {
          "file": "doppler.yaml",
          "changes": [
            "Project/config names if ducsigr"
          ]
        }
      ]
    },
    {
      "category": "10. GitHub Workflows",
      "description": "Update CI/CD configurations",
      "files": [
        {
          "file": ".github/workflows/*.yml",
          "changes": [
            "Docker image names",
            "Environment variable names",
            "Any ducsigr references"
          ]
        }
      ]
    },
    {
      "category": "11. Documentation",
      "description": "Update all documentation",
      "files": [
        {
          "file": "README.md",
          "changes": [
            "All branding: Ducsigr → Ducsigr",
            "URLs: ducsigr.com → ducsigr.com",
            "GitHub: ducsigr/ducsigr → ducsigr/ducsigr"
          ]
        },
        {
          "file": "CLAUDE.md",
          "changes": [
            "All branding and package references"
          ]
        },
        {
          "file": "docs/**/*.md",
          "changes": [
            "All branding and URLs"
          ]
        },
        {
          "file": ".claude/**/*.md",
          "changes": [
            "All references to @ducsigr packages"
          ]
        }
      ]
    },
    {
      "category": "12. API Router Imports",
      "description": "Update all source file imports",
      "files": [
        {
          "pattern": "packages/api/src/**/*.ts",
          "changes": [
            "Import @ducsigr/* → @ducsigr/*"
          ]
        }
      ]
    }
  ],

  "executionOrder": [
    "1. Create backup branch",
    "2. Update all package.json files (sed/replace)",
    "3. Rename proto directory and update proto files",
    "4. Regenerate proto types (make proto)",
    "5. Update SDK core files (rename + content)",
    "6. Update shared constants",
    "7. Global find/replace for remaining files",
    "8. Update pnpm-lock.yaml (pnpm install)",
    "9. Verify build (pnpm build)",
    "10. Verify tests (pnpm test)",
    "11. Update documentation"
  ],

  "globalReplacements": [
    {
      "find": "@ducsigr/",
      "replace": "@ducsigr/",
      "scope": "all source files"
    },
    {
      "find": "Ducsigr",
      "replace": "Ducsigr",
      "scope": "all files"
    },
    {
      "find": "ducsigr",
      "replace": "ducsigr",
      "scope": "all files"
    },
    {
      "find": "DUCSIGR",
      "replace": "DUCSIGR",
      "scope": "all files"
    }
  ],

  "testCases": [
    "pnpm install - no errors",
    "pnpm build - all packages compile",
    "pnpm test - all tests pass",
    "SDK import: import { Ducsigr } from '@ducsigr/sdk'",
    "Environment: DUCSIGR_API_KEY is read",
    "Proto types generate correctly",
    "Temporal task queue uses 'ducsigr-tasks'"
  ],

  "manualVerification": [
    "Docker images build successfully",
    "Marketing site displays correct branding",
    "API key prefix updated if desired",
    "Social links point to correct accounts"
  ],

  "notes": [
    "API key prefix 'co_sk_' may need discussion - suggest 'ds_sk_' for Ducsigr",
    "Redis keys will change - may need migration for existing data",
    "Temporal task queue name change may affect running workflows",
    "Domain URLs need DNS/hosting updates (outside scope)",
    "Social media accounts need to be created/renamed"
  ]
}
```

---

## Decision Points

Before execution, please clarify:

1. **API Key Prefix**: Should `co_sk_` become `ds_sk_` or stay unchanged?
2. **Redis Data Migration**: Are there existing Redis queues with data to migrate?
3. **Temporal Workflows**: Are there running workflows that need to complete first?

---

## Estimated Impact

| Category | File Count | Complexity |
|----------|------------|------------|
| Package names | ~15 | Low |
| SDK core | ~20 | Medium |
| Proto files | ~10 | Medium |
| Source imports | ~300+ | Low (automated) |
| Documentation | ~100+ | Low (automated) |
| Infrastructure | ~20 | Medium |

---

## Execution Commands

```bash
# 1. Create backup
git checkout -b rebrand/ducsigr
git add -A && git commit -m "chore: pre-rebrand snapshot"

# 2. Global replacements (run from root)
# Package scope
find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.json" -o -name "*.md" -o -name "*.yaml" -o -name "*.yml" \) \
  -not -path "./node_modules/*" -not -path "./.git/*" -not -path "./pnpm-lock.yaml" \
  -exec sed -i '' 's/@ducsigr\//@ducsigr\//g' {} +

# CamelCase
find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.md" \) \
  -not -path "./node_modules/*" -not -path "./.git/*" \
  -exec sed -i '' 's/Ducsigr/Ducsigr/g' {} +

# lowercase
find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.json" -o -name "*.md" -o -name "*.yaml" -o -name "*.yml" -o -name "*.proto" \) \
  -not -path "./node_modules/*" -not -path "./.git/*" -not -path "./pnpm-lock.yaml" \
  -exec sed -i '' 's/ducsigr/ducsigr/g' {} +

# UPPERCASE
find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.md" \) \
  -not -path "./node_modules/*" -not -path "./.git/*" \
  -exec sed -i '' 's/DUCSIGR/DUCSIGR/g' {} +

# 3. Rename proto directory
mv proto/ducsigr proto/ducsigr

# 4. Rename SDK file
mv packages/sdk/src/ducsigr.ts packages/sdk/src/ducsigr.ts

# 5. Regenerate proto types
make proto

# 6. Reinstall dependencies
pnpm install

# 7. Verify build
pnpm build

# 8. Verify tests
pnpm test
```

---

## Post-Execution Checklist

- [ ] All package names updated
- [ ] SDK exports `Ducsigr` instead of `Ducsigr`
- [ ] Proto package is `ducsigr.v1`
- [ ] Environment variables use `DUCSIGR_*` prefix
- [ ] Temporal task queue is `ducsigr-tasks`
- [ ] Redis keys use `ducsigr:*` prefix
- [ ] All tests pass
- [ ] Documentation reflects new branding
- [ ] Docker images use new names
