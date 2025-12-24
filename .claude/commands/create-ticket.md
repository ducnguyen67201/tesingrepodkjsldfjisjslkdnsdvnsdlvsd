# /create-ticket - Create GitHub Issues from Plan

Create GitHub issues for the implementation plan. **Does NOT commit or push any code.**

## Instructions

$ARGUMENTS

Take the most recent plan from the conversation and create GitHub issues for each implementation phase.

## What This Command Does

1. Parse the plan into discrete, actionable tickets
2. Create GitHub issues using `gh issue create`
3. Apply appropriate labels
4. Link related issues
5. **NO code changes, NO commits, NO pushes**

## Issue Structure

### Epic Issue (Parent)

```bash
gh issue create \
  --title "[Epic] {Feature Name}" \
  --body "$(cat <<'EOF'
## Summary
{feature.summary}

## Architecture Decisions
{key decisions from plan}

## Acceptance Criteria
- [ ] Database schema implemented and migrated
- [ ] API endpoints working with tests passing
- [ ] Frontend components complete
- [ ] All tests passing
- [ ] Build succeeds

## Sub-tasks
- #XX Database: {models}
- #XX API: {router + service}
- #XX Tests: {test file}
- #XX Frontend: {components}

## Technical Notes
{any important technical considerations}
EOF
)" \
  --label "epic,enhancement"
```

### Database Issue

```bash
gh issue create \
  --title "[DB] Add {model} schema and migration" \
  --body "$(cat <<'EOF'
## Task
Create Prisma schema and migration for {feature}

## Schema Location
`{plan.database.schemaFile}`

## Models
{plan.database.models}

## Migration
```bash
pnpm db:migrate --name {plan.database.migrationName}
```

## Checklist
- [ ] Create/update Prisma schema
- [ ] Run migration
- [ ] Generate Prisma client
- [ ] Verify with `pnpm db:generate`
EOF
)" \
  --label "database,backend"
```

### API Issue

```bash
gh issue create \
  --title "[API] Implement {domain} router and service" \
  --body "$(cat <<'EOF'
## Task
Implement tRPC router and service layer for {feature}

## Files
- Schema: `{plan.schemas.file}`
- Router: `{plan.api.routerFile}`
- Service: `{plan.api.serviceFile}`

## Procedures
{plan.api.procedures as checklist}

## Conventions
- Thin routers (< 20 lines per procedure)
- Business logic in service
- Zod schemas as source of truth
- Atomic database operations

## Checklist
- [ ] Create Zod schemas with type exports
- [ ] Implement service methods
- [ ] Create router procedures
- [ ] Register router in index.ts
EOF
)" \
  --label "api,backend"
```

### Tests Issue

```bash
gh issue create \
  --title "[Tests] Write tests for {domain} router" \
  --body "$(cat <<'EOF'
## Task
Write comprehensive tests for {domain} API (TDD approach)

## File
`{plan.tests.file}`

## Test Cases
{plan.tests.testCases as checklist}

## Test Categories
- [ ] Happy path
- [ ] Input validation
- [ ] Authentication
- [ ] Authorization
- [ ] Not found handling
- [ ] Conflict handling

## Run Tests
```bash
pnpm --filter @cognobserve/api test -- --run {domain}.test.ts
```
EOF
)" \
  --label "testing,backend"
```

### Frontend Issue

```bash
gh issue create \
  --title "[Frontend] Implement {domain} UI components" \
  --body "$(cat <<'EOF'
## Task
Implement frontend hook and components for {feature}

## Files
- Hook: `{plan.frontend.hook.file}`
- Components: {plan.frontend.components}
- Pages: {plan.frontend.pages}

## Conventions
- Components < 150 lines
- No inline functions in JSX
- Logic in hooks, not components
- Use shadcn/ui components
- Centralized toasts (@/lib/errors, @/lib/success)

## Checklist
- [ ] Create domain hook with queries/mutations
- [ ] Implement list component
- [ ] Implement form/dialog components
- [ ] Add page route
- [ ] Add toast notifications
EOF
)" \
  --label "frontend,ui"
```

## Labels Used

| Label | Purpose |
|-------|---------|
| `epic` | Parent tracking issue |
| `enhancement` | New feature |
| `database` | Schema/migration work |
| `backend` | API layer work |
| `frontend` | UI work |
| `testing` | Test implementation |
| `api` | tRPC router work |
| `ui` | Component work |

## Usage

```bash
# After /plan completes:
/create-ticket

# With custom prefix:
/create-ticket prefix="[Sprint 5]"

# Assign to someone:
/create-ticket assignee=@username
```

## Important

- **READ ONLY** - This command only creates GitHub issues
- **NO CODE CHANGES** - Does not modify any files
- **NO COMMITS** - Does not create any git commits
- **NO PUSH** - Does not push anything to remote

## Output

After creating issues, display:
```
Created issues:
- #123 [Epic] Feature Name
- #124 [DB] Add schema and migration
- #125 [API] Implement router and service
- #126 [Tests] Write tests for router
- #127 [Frontend] Implement UI components

View epic: https://github.com/{org}/{repo}/issues/123
```
