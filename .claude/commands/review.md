# /review - Code Review Command

Use the **code-reviewer** skill to review code changes for Ducsigr convention compliance.

## Instructions

Review the specified files or recent changes for:

1. **Convention Compliance**
   - Zod schemas as source of truth
   - Thin routers, logic in services
   - No inline functions in JSX
   - Components < 150 lines
   - Proper toast usage (@/lib/errors, @/lib/success)

2. **Code Quality**
   - Type safety (no `any`, no type assertions on unknown data)
   - Error handling patterns
   - Atomic database operations
   - Proper imports from shared packages

3. **Security**
   - No exposed secrets
   - Input validation with Zod
   - Proper authorization checks

## Usage

```
/review                     # Review staged changes
/review src/hooks/          # Review specific directory
/review --file api-keys.ts  # Review specific file
```

## Checklist Applied

### Backend
- [ ] Routers are thin (< 20 lines per procedure)
- [ ] Business logic in service files
- [ ] Zod schemas in packages/api/src/schemas/
- [ ] Atomic operations (no check-then-act)
- [ ] Proper TRPCError usage

### Frontend
- [ ] Components < 150 lines
- [ ] No inline functions in JSX
- [ ] Logic in hooks, not components
- [ ] Using shadcn/ui components
- [ ] Centralized toast usage

### Shared
- [ ] Types from @ducsigr/db or @ducsigr/api/schemas
- [ ] Zod validation for unknown data
- [ ] No type assertions (`as`) on external data

## Output

The reviewer provides:
- **Critical** - Must fix before merge
- **Warning** - Should fix
- **Suggestion** - Consider improving
- **Good** - Following conventions correctly
