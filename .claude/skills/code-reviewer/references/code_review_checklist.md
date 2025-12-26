# Code Review Checklist

## Quick Reference

Use this checklist for every PR. Skip sections that don't apply.

---

## 1. Architecture & Design

### Does the change fit?
- [ ] Follows existing patterns in the codebase
- [ ] No unnecessary abstractions or over-engineering
- [ ] Solves the actual problem, not a hypothetical one
- [ ] Changes are minimal and focused (no scope creep)

### Monorepo structure respected?
- [ ] Types defined in `proto/*.proto` if shared across services
- [ ] Web-specific code stays in `apps/web/`
- [ ] Go service code stays in `apps/ingest/`
- [ ] Shared utilities in `packages/shared/`
- [ ] Database changes through `packages/db/`

---

## 2. TypeScript / React (apps/web)

### Component Quality
- [ ] No inline arrow functions in JSX
- [ ] Event handlers extracted: `const handleClick = () => {}` not `onClick={() => {}}`
- [ ] Map callbacks extracted: `items.map(renderItem)` not `items.map((item) => <Item />)`
- [ ] Components are thin - business logic in hooks
- [ ] Props interface defined and exported if reusable

### Hooks
- [ ] Custom hooks in `src/hooks/` with `use` prefix
- [ ] No inline callbacks in hook dependencies
- [ ] Proper dependency arrays (exhaustive-deps)
- [ ] Data fetching logic in hooks, not components

### Constants
- [ ] `UPPER_SNAKE_CASE` for constants
- [ ] Constants at module level, not inside components
- [ ] Complex/shared constants in `src/lib/constants/`

### UI Components
- [ ] Using shadcn/ui components from `@/components/ui/`
- [ ] No custom CSS for standard UI elements
- [ ] Semantic color variables (`primary`, `secondary`, `muted`, `destructive`)
- [ ] Using `cn()` utility for class merging

### Environment Variables
- [ ] Using `env.VAR_NAME` from `@/lib/env`, not `process.env`
- [ ] New env vars added to env.ts schema

---

## 3. Go Service (apps/ingest)

### Structure
- [ ] Follows standard Go project layout
- [ ] Internal packages in `internal/`
- [ ] Proto imports use `pb "github.com/ducsigr/ingest/internal/proto/ducsigrv1"`

### Error Handling
- [ ] Errors wrapped with context: `fmt.Errorf("doing x: %w", err)`
- [ ] No silent error swallowing
- [ ] Proper error types for different scenarios

### Performance
- [ ] No unnecessary allocations in hot paths
- [ ] Context propagation for cancellation
- [ ] Proper connection pooling

---

## 4. Code Quality

### Readability
- [ ] Self-documenting code (clear names > comments)
- [ ] No dead code or commented-out code
- [ ] No TODO comments without linked issues
- [ ] Consistent formatting (prettier/gofmt)

### Simplicity
- [ ] No premature abstractions
- [ ] Three similar lines > premature abstraction
- [ ] No helper functions for one-time operations
- [ ] No backwards-compatibility hacks for unused code

### Type Safety
- [ ] No `any` types (use `unknown` if needed)
- [ ] Proper null/undefined handling
- [ ] Discriminated unions over type assertions
- [ ] No type casting without validation

---

## 5. Security

### Input Validation
- [ ] All user input validated at system boundaries
- [ ] No SQL/command injection vectors
- [ ] XSS prevention (React handles most, but check `dangerouslySetInnerHTML`)

### Authentication & Authorization
- [ ] Auth checks on protected routes/endpoints
- [ ] No sensitive data in logs
- [ ] No hardcoded secrets/credentials
- [ ] API keys validated before use

### Data Protection
- [ ] No PII in error messages
- [ ] Proper data sanitization before storage
- [ ] Secure defaults

---

## 6. Testing

### Coverage
- [ ] Critical paths have tests
- [ ] Edge cases covered
- [ ] Error scenarios tested

### Quality
- [ ] Tests are readable and maintainable
- [ ] No flaky tests
- [ ] Mocks are appropriate (not over-mocked)

---

## 7. Performance

### Frontend
- [ ] No unnecessary re-renders
- [ ] Large lists virtualized
- [ ] Images optimized (next/image)
- [ ] No blocking operations on main thread

### Backend
- [ ] N+1 queries avoided
- [ ] Appropriate indexes exist
- [ ] No unbounded queries (pagination)
- [ ] Caching where appropriate

---

## 8. Proto/Types (if modified)

- [ ] Changes are backwards compatible (or migration planned)
- [ ] `make proto` run and generated files committed
- [ ] Both Go and TypeScript types updated
- [ ] Breaking changes documented

---

## 9. Database (if modified)

- [ ] Migration is reversible
- [ ] Indexes added for query patterns
- [ ] No breaking changes to existing data
- [ ] Schema in `packages/db/prisma/schema.prisma` updated

---

## 10. Final Checks

- [ ] PR has clear description of what and why
- [ ] `pnpm lint` passes
- [ ] `make build` succeeds
- [ ] No merge conflicts
- [ ] Changes tested locally

---

## Red Flags (Auto-Reject)

Immediately request changes if you see:

1. **Inline functions in JSX** - Extract to named handlers
2. **`process.env` usage** - Use env.ts
3. **Custom CSS for standard UI** - Use shadcn/ui
4. **`any` types** - Fix type safety
5. **Secrets in code** - Use environment variables
6. **Console.log in production code** - Use proper logging
7. **Commented-out code** - Delete it
8. **Unused imports/variables** - Clean up

---

## Approval Criteria

**Approve** when:
- All relevant checklist items pass
- No red flags present
- Code is production-ready

**Request Changes** when:
- Red flags present
- Critical checklist items fail
- Security concerns exist

**Comment** when:
- Minor suggestions that don't block merge
- Questions about approach
- Future improvement ideas
