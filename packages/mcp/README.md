# @ducsigr/mcp

MCP (Model Context Protocol) server that exposes Ducsigr's observability data to AI assistants like Claude Code.

## Setup

### 1. Build

```bash
pnpm --filter @ducsigr/mcp build
```

### 2. Configure Claude Code

Add to your `.claude/mcp.json`:

```json
{
  "mcpServers": {
    "ducsigr": {
      "command": "node",
      "args": ["./packages/mcp/dist/index.js"],
      "env": {
        "DUCSIGR_API_KEY": "co_sk_your_api_key_here",
        "DUCSIGR_API_URL": "http://localhost:3000"
      }
    }
  }
}
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DUCSIGR_API_KEY` | Yes | - | API key for authentication |
| `DUCSIGR_API_URL` | Yes | - | URL of the Ducsigr web app (e.g. `http://localhost:3000`) |
| `NODE_ENV` | No | `production` | Environment |

## Available Tools

| Tool | Description |
|------|-------------|
| `list_traces` | List traces with filters (time range, errors, search, duration, service) |
| `get_trace` | Get detailed trace with span tree and LLM inputs/outputs |
| `get_error_traces` | Get error spans grouped by exception type |
| `search_spans` | Search spans by type, model, query, or error status |
| `get_cost_summary` | Cost breakdown by model, day, or service |
| `get_trace_stats` | Aggregate stats with latency percentiles and error rates |
| `list_projects` | Current project info (name, workspace, trace count) |

## Development

```bash
# Run tests
pnpm --filter @ducsigr/mcp test

# Watch mode
pnpm --filter @ducsigr/mcp test:watch

# Type check
pnpm --filter @ducsigr/mcp typecheck

# Build
pnpm --filter @ducsigr/mcp build
```
