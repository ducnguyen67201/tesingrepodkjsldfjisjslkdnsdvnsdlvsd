# Release Guide

This document explains how to release new versions of Ducsigr.

## Quick Reference

### Commit Message Format

```
<type>: <description>

[optional body]

[optional footer]
```

### Commit Types & Version Bumps

| Type | Description | Version Bump | Example |
|------|-------------|--------------|---------|
| `feat` | New feature | **Minor** (0.1.0 → 0.2.0) | `feat: add user authentication` |
| `fix` | Bug fix | Patch (0.1.0 → 0.1.1) | `fix: resolve login timeout` |
| `perf` | Performance improvement | Patch | `perf: optimize database queries` |
| `refactor` | Code refactoring | Patch | `refactor: simplify auth logic` |
| `docs` | Documentation | Patch | `docs: update API guide` |
| `style` | Code style (formatting) | Patch | `style: fix indentation` |
| `test` | Adding tests | Patch | `test: add auth unit tests` |
| `build` | Build system changes | Patch | `build: update dockerfile` |
| `ci` | CI/CD changes | Patch | `ci: add lint workflow` |
| `chore` | Maintenance tasks | Patch | `chore: update dependencies` |
| `BREAKING CHANGE` | Breaking API change | **Major** (0.1.0 → 1.0.0) | See below |

### Breaking Changes

For major version bumps, add `BREAKING CHANGE:` in the commit footer:

```
feat: change authentication API

BREAKING CHANGE: JWT tokens now expire after 24 hours instead of 7 days
```

## Release Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        RELEASE FLOW                             │
└─────────────────────────────────────────────────────────────────┘

  1. Develop          2. Merge to Stage       3. Auto Tag           4. Docker Build
  ─────────────────────────────────────────────────────────────────────────────────►

  ┌──────────┐       ┌──────────────┐       ┌──────────────┐       ┌──────────────┐
  │  PR to   │──────►│  Merge to    │──────►│  Auto-tag    │──────►│  Build &     │
  │  stage   │       │  stage       │       │  creates     │       │  Publish     │
  │          │       │              │       │  v0.1.0      │       │  Images      │
  └──────────┘       └──────────────┘       └──────────────┘       └──────────────┘
                                                   │
                                                   ▼
                                            ┌──────────────┐
                                            │  GitHub      │
                                            │  Release     │
                                            │  Created     │
                                            └──────────────┘
```

## How to Release

### Standard Release (Recommended)

1. **Create a feature branch and make changes:**
   ```bash
   git checkout -b feature/my-feature
   # make changes...
   git add .
   git commit -m "feat: add my awesome feature"
   git push origin feature/my-feature
   ```

2. **Create PR to `stage` branch and merge**

3. **Done!** The CI/CD will automatically:
   - Detect your conventional commits
   - Create a new version tag (e.g., `v0.2.0`)
   - Build and publish Docker images
   - Create a GitHub Release

### Manual Release (Override)

If you need to create a specific version manually:

```bash
# Create tag
git tag v1.0.0

# Push tag
git push origin v1.0.0
```

### Check Release Status

```bash
# List all tags
git tag

# View recent releases
gh release list

# View workflow runs
gh run list --workflow=docker-publish.yml
```

## Docker Images

After release, images are available at:

```bash
# Quick Start (all-in-one)
docker pull ghcr.io/ducnguyen67201/ducsigr:latest
docker pull ghcr.io/ducnguyen67201/ducsigr:v0.1.0

# Production (app only)
docker pull ghcr.io/ducnguyen67201/ducsigr-app:latest
docker pull ghcr.io/ducnguyen67201/ducsigr-app:v0.1.0
```

## Examples

### Feature Release

```bash
git commit -m "feat: add real-time trace streaming"
# Results in: v0.1.0 → v0.2.0
```

### Bug Fix Release

```bash
git commit -m "fix: resolve memory leak in worker"
# Results in: v0.2.0 → v0.2.1
```

### Multiple Commits

When merging a PR with multiple commits, the highest bump wins:

```
fix: resolve timeout issue      # patch
feat: add new dashboard         # minor ← wins
chore: update dependencies      # patch
```
Result: Minor bump (e.g., v0.2.1 → v0.3.0)

### Breaking Change Release

```bash
git commit -m "feat: redesign API authentication

BREAKING CHANGE: API keys now require project scope prefix"
# Results in: v0.3.0 → v1.0.0
```

## Troubleshooting

### Tag not created?

Check if your commit follows conventional format:
- ✅ `feat: add feature` (correct)
- ❌ `Added feature` (missing type)
- ❌ `feat - add feature` (wrong separator, use colon)

### Docker build failed?

Check the Actions tab for logs:
```bash
gh run list --workflow=docker-publish.yml
gh run view <run-id> --log
```

### Need to delete a tag?

```bash
# Delete local tag
git tag -d v0.1.0

# Delete remote tag
git push origin --delete v0.1.0
```

## CI/CD Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `auto-tag.yml` | Push to `stage` | Creates version tags from commits |
| `docker-publish.yml` | Tag `v*` pushed | Builds & publishes Docker images |
