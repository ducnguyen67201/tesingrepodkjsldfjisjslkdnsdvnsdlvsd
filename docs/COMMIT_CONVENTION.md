# Commit Convention

This project follows [Conventional Commits](https://www.conventionalcommits.org/).

## Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

## Types

| Type | When to use |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, no code change |
| `refactor` | Code change that neither fixes nor adds |
| `perf` | Performance improvement |
| `test` | Adding/updating tests |
| `chore` | Build, CI, dependencies, tooling |
| `ci` | CI/CD changes |
| `build` | Build system changes |

## Scopes

Scopes are optional but recommended:

| Scope | Area |
|-------|------|
| `web` | Next.js dashboard |
| `ingest` | Go ingestion service |
| `worker` | Background processor |
| `db` | Database/Prisma |
| `proto` | Protobuf definitions |
| `shared` | Shared packages |

## Examples

### Basic

```
feat: add user authentication
fix: handle empty trace name
docs: add API documentation
chore: update dependencies
```

### With Scope

```
feat(web): add dashboard page
feat(ingest): add rate limiting
fix(worker): retry failed jobs
refactor(db): simplify schema
ci: add GitHub Actions workflows
```

### With Body

```
fix(ingest): handle concurrent trace writes

Multiple traces with the same ID were causing race conditions.
Added mutex lock around the write operation.
```

### Breaking Changes

Add `!` after type/scope or use `BREAKING CHANGE` footer:

```
feat(api)!: change trace endpoint response format

BREAKING CHANGE: response now returns array instead of object
```

## Quick Reference

```bash
# Features
git commit -m "feat(web): add dark mode toggle"
git commit -m "feat(ingest): support batch trace ingestion"

# Fixes
git commit -m "fix(worker): prevent duplicate processing"
git commit -m "fix(db): correct foreign key constraint"

# Maintenance
git commit -m "chore: upgrade to Node 24"
git commit -m "ci: add lint workflow"
git commit -m "docs: update README"

# Refactoring
git commit -m "refactor(web): extract auth logic to hook"
git commit -m "perf(ingest): optimize JSON parsing"
```

## Why Use This?

- **Consistent history** - Easy to read and understand
- **Auto-changelog** - Generate release notes automatically
- **Semantic versioning** - Determine version bumps from commits
- **Searchable** - Filter commits by type or scope
