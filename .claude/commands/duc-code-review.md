# /duc-code-review - Exhaustive Code Review Command

Perform a **line-by-line exhaustive code review** of all changes on the current branch. Every single line of diff is reviewed in 5-line chunks. Nothing is skipped. Automatically detects and reviews all file changes.

## Auto-Detection

Run `git diff main` automatically to collect ALL changes on the current branch vs main. No arguments needed.

Filter out: `pnpm-lock.yaml`, `package-lock.json`, `*.pb.go`, `*_pb.ts`, migration SQL files.

## Step-by-Step Process

### Phase 1: Collect the Diff

1. Run `git diff main` (exclude lockfiles and generated files)
2. Parse the diff into per-file sections with line numbers

### Phase 2: Chunk-by-Chunk Review (5 lines at a time)

For **each file** in the diff:

1. Read the **full file** (not just the diff) to understand context
2. Split the diff hunks into chunks of **5 added/modified lines** each
3. For **each chunk**, evaluate against ALL of the following rules:

#### CLAUDE.md Rules Checklist (apply every rule to every chunk)

**TypeScript / React:**
- [ ] No inline arrow functions in JSX (`onClick={() => {}}` is FORBIDDEN)
- [ ] Map callbacks extracted to named functions (`items.map(renderItem)`)
- [ ] Event handlers defined outside JSX (`const handleClick = () => {}`)
- [ ] Constants use UPPER_SNAKE_CASE and are at module level
- [ ] Components < 150 lines total
- [ ] Business logic in hooks, not components
- [ ] One component per file
- [ ] Using shadcn/ui components from `@/components/ui/` (no custom CSS for standard UI)
- [ ] Using `cn()` utility for class merging
- [ ] Environment variables via `env` from `@/lib/env` (NO `process.env`)

**Type Safety:**
- [ ] No `any` types (use `unknown` + narrowing)
- [ ] No type assertions (`as`) on unknown/external data
- [ ] ALL `fetch()` responses validated with Zod `safeParse()`
- [ ] ALL `JSON.parse()` results validated with Zod
- [ ] ALL webhook/external payloads validated with Zod
- [ ] Zod schemas defined in `packages/api/src/schemas/`
- [ ] Types inferred from Zod schemas (`z.infer<typeof Schema>`)
- [ ] `z.enum()` values extracted to UPPER_SNAKE_CASE `as const` arrays (NO inline string arrays in `z.enum()`)
- [ ] Enum constants reused across the entire app (NO duplicating values that already exist in another file — import and reuse)

**Imports & Types:**
- [ ] Types imported from `@ducsigr/db`, `@ducsigr/api/schemas`, `@ducsigr/proto`
- [ ] NO duplicate type definitions (never manually define interfaces that exist in shared packages)
- [ ] NO `import { X } from "@prisma/client"` (use `@ducsigr/db`)
- [ ] Client components import from `@ducsigr/api/schemas` (NOT `@ducsigr/api`)

**Toast & Error Handling:**
- [ ] NO `import { toast } from "sonner"` (FORBIDDEN)
- [ ] Errors use `showError()`, `showErrorMessage()`, or domain-specific error toasts from `@/lib/errors`
- [ ] Success uses `showSuccess()`, domain toasts from `@/lib/success`
- [ ] NO inline toast messages

**API Responses:**
- [ ] NO `NextResponse.json()` directly (use `@/lib/api-responses` or `@/lib/webhook-responses`)

**Backend (tRPC / API):**
- [ ] Routers are thin (< 20 lines per procedure body)
- [ ] Business logic in service files (`packages/api/src/services/`)
- [ ] Zod schemas in `packages/api/src/schemas/`
- [ ] Atomic operations (no check-then-act race conditions)
- [ ] Transactions for multi-step mutations

**Database:**
- [ ] Prisma schema changes have migration (`pnpm db:migrate --name ...`)
- [ ] No unbounded queries (must have `take` or cursor)
- [ ] Using `select` to limit fields where appropriate
- [ ] No N+1 queries

**Temporal / Worker:**
- [ ] Activities are READ-ONLY for database (no create/update/delete)
- [ ] Mutations go through `getInternalCaller()` tRPC calls
- [ ] Workflows don't import non-deterministic modules (OpenAI, Redis, fs, net)
- [ ] `@ducsigr/shared` main import only for constants (LLM/Cache via sub-paths in activities only)

**Security:**
- [ ] No hardcoded secrets or credentials
- [ ] No sensitive data in logs or error messages
- [ ] Input validated at system boundaries
- [ ] No XSS vectors (`dangerouslySetInnerHTML`)

**Performance:**
- [ ] No unnecessary re-renders (check useMemo/useCallback usage)
- [ ] Long lists virtualized (100+ items)
- [ ] User inputs debounced (search, filters)
- [ ] Heavy components lazy-loaded

**URL State:**
- [ ] Panels, modals, tabs sync to URL query params
- [ ] Namespaced param names (e.g., `alertTab` not `tab`)

**Code Quality:**
- [ ] No dead code or commented-out code
- [ ] No `console.log` in production code
- [ ] No unused imports/variables
- [ ] Functions < 30 lines (candidates for splitting if longer)
- [ ] Self-documenting names
- [ ] No premature abstractions
- [ ] No backwards-compatibility hacks for unused code

**Naming:**
- [ ] No competitor names mentioned (use "industry standard" or "similar platforms")

### Phase 3: Output Format

For each chunk reviewed, output:

```
## File: <path/to/file.ts>

### Chunk <N> (lines <start>-<end>)
```diff
<the 5 lines of diff being reviewed>
```

**Findings:**
- <severity emoji> <rule violated> — <specific explanation>
- ...

**Verdict:** PASS | ISSUES FOUND
```

Use these severity levels:
- `CRITICAL` - Must fix before merge. Blocks approval.
- `WARNING` - Should fix. Does not block but is a code smell.
- `SUGGESTION` - Nice to have improvement.
- `GOOD` - Explicitly call out when a chunk follows conventions well (brief).

### Phase 4: Final Summary

After all chunks are reviewed, output:

```
---

# Review Summary

**Files reviewed:** <count>
**Chunks reviewed:** <count>
**Lines of diff reviewed:** <count>

## Findings

| Severity | Count | Key Issues |
|----------|-------|------------|
| CRITICAL  | <n>   | <top issues> |
| WARNING  | <n>   | <top issues> |
| SUGGESTION | <n> | <top issues> |

## Verdict: APPROVE / REQUEST CHANGES / COMMENT

<Brief explanation of verdict>

## Required Fixes (if any)
1. <file:line> — <what to fix>
2. ...
```

### Verdict Criteria

**APPROVE** when:
- Zero CRITICAL findings
- All CLAUDE.md rules followed
- Code is production-ready

**REQUEST CHANGES** when:
- Any CRITICAL finding exists
- Red flags: inline JSX functions, `any` types, `process.env`, direct `toast` import, `NextResponse.json()`, type assertions on unknown data, direct DB writes in Temporal activities, inline string arrays in `z.enum()`

**COMMENT** when:
- Only WARNINGs and SUGGESTIONs exist
- Minor improvements that don't block merge

## Important Rules

1. **EVERY line of diff must be reviewed.** No skipping. No summarizing.
2. **Read the full file for context** before reviewing its diff chunks.
3. **Be specific.** Reference exact line numbers and exact rule violations.
4. **No false positives.** Only flag actual violations, not style preferences.
5. **Chunk size is 5 lines of added/modified code.** Context lines (unchanged) don't count toward the 5.
6. **Review ALL rules for ALL chunks.** Don't selectively apply rules.
