# Update Code Reviewer Skill

You are updating the code-reviewer skill based on user instructions.

## Instructions

$ARGUMENTS

## Context Files to Read

Before making changes, read these files to understand current state:

1. **Project conventions**: `CLAUDE.md`
2. **Code review checklist**: `.claude/skills/code-reviewer/references/code_review_checklist.md`
3. **Coding standards**: `.claude/skills/code-reviewer/references/coding_standards.md`
4. **Common antipatterns**: `.claude/skills/code-reviewer/references/common_antipatterns.md`

## Update Guidelines

### Which file to update:

| User wants to add... | Update this file |
|---------------------|------------------|
| New checklist items, PR review steps | `code_review_checklist.md` |
| New coding conventions, patterns, style rules | `coding_standards.md` |
| New antipatterns, bad practices to avoid | `common_antipatterns.md` |
| All of the above | Update all three files |

### Style requirements:

- Match existing formatting and structure
- Use concrete code examples (BAD/GOOD pattern)
- Keep it actionable and specific to Ducsigr stack
- Reference project conventions from CLAUDE.md when relevant
- Be concise - no fluff

### Tech stack context:

- **Web**: Next.js 16, React 19, TypeScript 5.7, Tailwind, shadcn/ui
- **Ingest**: Go 1.23 with chi router
- **Database**: PostgreSQL with Prisma 7
- **Types**: Protocol Buffers (proto → Go + TypeScript)
- **Monorepo**: pnpm workspaces + Turborepo

## Workflow

1. Read all context files
2. Identify which reference file(s) need updates
3. Make targeted edits (add new sections, update existing)
4. Summarize what was changed

## Output

After updating, provide a brief summary of:
- Which files were modified
- What was added/changed
- Any suggestions for related updates
