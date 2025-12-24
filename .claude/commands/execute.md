# /execute - Execute Implementation Plan

Use the **executor** agent to implement the approved plan by coordinating multiple specialized agents.

## Prerequisites

- Must have an approved plan from `/plan` command
- Review the plan before executing
- Ensure you understand what will be implemented

## Instructions

1. Retrieve the most recent plan from the conversation
2. Spawn the `executor` agent with the plan
3. The executor will coordinate:
   - **Phase 1**: Database schema + migration
   - **Phase 2**: test-writer + backend-dev (parallel or sequential)
   - **Phase 3**: API verification (tests must pass)
   - **Phase 4**: frontend-dev
   - **Phase 5**: Final verification (tests, types, build)

## Execution Phases

```
/execute
    │
    ▼
┌─────────────────────────────────────┐
│ Phase 1: Database                   │
│ - Create Prisma schema              │
│ - Run migration                     │
│ - Generate client                   │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ Phase 2: API (Parallel Agents)      │
│                                     │
│  [test-writer]    [backend-dev]     │
│       ↓                ↓            │
│   Tests           Schemas           │
│                   Service           │
│                   Router            │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ Phase 3: Verify                     │
│ pnpm --filter @cognobserve/api test │
│ (must pass before frontend)        │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ Phase 4: Frontend                   │
│                                     │
│       [frontend-dev]                │
│            ↓                        │
│   Hook → Components → Page          │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ Phase 5: Final Verification         │
│ pnpm test && pnpm typecheck         │
│ && pnpm build                       │
└─────────────────────────────────────┘
```

## Usage

```
# After /plan completes and you approve:
/execute

# Or with custom instructions:
/execute skip frontend  # Only implement backend
/execute tdd strict     # Run test-writer before backend-dev
```

## Progress Reporting

The executor will report after each phase:
- ✅ Completed steps
- ⏳ In progress
- ❌ Failures with details
- 📋 Next steps

## Error Handling

If any phase fails:
1. Executor will report the error
2. You can ask to retry or fix specific issues
3. Use `/execute resume` to continue from failure point

## Important

- **Database first**: Migrations must complete before API work
- **Tests must pass**: API tests verified before frontend
- **Convention compliance**: All code follows CognObserve patterns
- **Incremental**: Each phase verified before proceeding
