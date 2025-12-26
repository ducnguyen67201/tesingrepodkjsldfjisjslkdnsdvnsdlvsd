# Automated RCA System with GitHub Integration

> **Epic #127** | 89 Story Points | 5 Sprints

This epic introduces an **Automated Root Cause Analysis (RCA) System** that correlates alerts with recent code changes, analyzes trace patterns, and generates actionable insights using LLM reasoning.

---

## Quick Links

| Document | Description |
|----------|-------------|
| [Epic Specification](./127_AUTOMATED_RCA_EPIC.md) | Full epic overview, architecture, and sub-tickets |
| [Sprint 1: Foundation](./128_SPRINT_1_FOUNDATION_SPEC.md) | GitHub indexing infrastructure (21 pts) |
| [Sprint 2: Vector Search](./132_SPRINT_2_VECTOR_SEARCH_SPEC.md) | Semantic code search with pgvector (21 pts) |
| [Sprint 3: RCA Engine](./136_SPRINT_3_RCA_ENGINE_SPEC.md) | Trace analysis and LLM-based RCA (26 pts) |
| [Sprint 4: Integration](./140_SPRINT_4_INTEGRATION_SPEC.md) | RCA in notifications and dashboard (13 pts) |
| [Sprint 5: Eval Pipeline](./143_SPRINT_5_EVAL_PIPELINE_SPEC.md) | Proactive regression detection (8 pts) |

---

## Problem Statement

When alerts fire in Ducsigr (error rate spikes, latency degradation), users must manually investigate root causes by:

1. Correlating alert timing with deployments
2. Analyzing trace/span data during incidents
3. Reviewing recent commits and PRs
4. Identifying patterns across historical alerts

**This is time-consuming and error-prone.**

---

## Solution Overview

Build an automated RCA system that:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          RCA SYSTEM ARCHITECTURE                            │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────────────────────────┐
│   GitHub     │     │   Alert      │     │         RCA Engine               │
│   Webhooks   │────▶│   Fires      │────▶│                                  │
└──────────────┘     └──────────────┘     │  1. Trace Analysis               │
       │                    │             │  2. Code Correlation             │
       ▼                    │             │  3. Pattern Matching             │
┌──────────────┐            │             │  4. LLM-Powered Reasoning        │
│   Index      │            │             └──────────────────────────────────┘
│   Pipeline   │            │                           │
│              │            │                           ▼
│ • Commits    │            │             ┌──────────────────────────────────┐
│ • PRs        │            │             │       RCA Report                 │
│ • Files      │            │             │                                  │
│ • Embeddings │            │             │  • Root Cause Hypothesis         │
└──────────────┘            │             │  • Related Code Changes          │
       │                    │             │  • Affected Spans/Traces         │
       ▼                    │             │  • Remediation Steps             │
┌──────────────┐            │             └──────────────────────────────────┘
│   Vector DB  │◀───────────┘                           │
│  (pgvector)  │                                        ▼
└──────────────┘                          ┌──────────────────────────────────┐
                                          │   Enhanced Notification          │
                                          │   (Discord, Slack, Email)        │
                                          └──────────────────────────────────┘
```

---

## Key Features

### 1. GitHub Project Indexing
- **Webhook-driven**: Real-time indexing on push/PR events
- **Incremental**: Only index changed files (90% cost reduction)
- **Semantic chunking**: Preserve function/class boundaries
- **Vector embeddings**: OpenAI text-embedding-3-small

### 2. Intelligent Code Correlation
- **Temporal**: Weight recent changes higher
- **Semantic**: Vector similarity to error messages
- **Path matching**: Stack traces → changed files
- **Multi-signal fusion**: Combine signals for accuracy

### 3. LLM-Powered RCA
- **Severity-based model selection**: Sonnet for critical, Haiku for others
- **Structured output**: JSON with hypothesis, confidence, remediation
- **Cost-optimized**: Template-based for low severity (~$0.02/RCA average)

### 4. Enhanced Notifications
- **RCA in alerts**: Hypothesis, related change, actions
- **Detail page**: Full analysis with code snippets
- **User feedback**: Improve future analyses

---

## Architecture Deep Dive

### Temporal Workflows

```
┌─────────────────────────────────────────────────────────────────────┐
│                    TEMPORAL WORKFLOW ARCHITECTURE                    │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  GitHub Index   │     │   RCA Analysis  │     │  Eval Pipeline  │
│    Workflow     │     │    Workflow     │     │    Workflow     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                         ACTIVITIES                               │
├─────────────────┬─────────────────┬─────────────────────────────┤
│ fetchCommits    │ analyzeTraces   │ runEvalSuite               │
│ fetchPRs        │ searchCodebase  │ compareBaseline            │
│ chunkCode       │ correlateChanges│ detectRegression           │
│ generateEmbed   │ generateRCA     │ reportResults              │
│ storeChunks     │ storeRCA        │ triggerAlert               │
└─────────────────┴─────────────────┴─────────────────────────────┘
```

### Data Model

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DATABASE SCHEMA                               │
└─────────────────────────────────────────────────────────────────────┘

Project
  │
  ├── GitHubRepository (1:1)
  │     ├── GitCommit (1:N)
  │     ├── GitPullRequest (1:N)
  │     └── CodeChunk (1:N) ──── embedding: vector(1536)
  │
  ├── Alert (1:N)
  │     └── AlertHistory (1:N)
  │           └── AlertRCA (1:1)
  │                 ├── hypothesis
  │                 ├── confidence
  │                 ├── analysis (JSON)
  │                 ├── relatedCommitIds[]
  │                 └── relatedPRIds[]
  │
  └── EvalSuite (1:N) [Sprint 5]
        └── EvalRun (1:N)
```

### Cost-Optimized Processing Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ TIER 1: DETERMINISTIC (FREE)                                                │
│                                                                             │
│   • Temporal correlation: Commits within 24h of alert                       │
│   • Error pattern matching: Stack traces → file paths                       │
│   • Span metadata: Model names, endpoints from spans                        │
│                                                                             │
│   Output: Candidate list (5-20 items)                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ TIER 2: EMBEDDING SEARCH (~$0.001/search)                                   │
│                                                                             │
│   • Embed error messages + stack traces                                     │
│   • Vector similarity against indexed code                                  │
│                                                                             │
│   Output: Ranked code chunks (top 10)                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ TIER 3: LLM REASONING (SMART COST)                                          │
│                                                                             │
│   • CRITICAL: Claude Sonnet (~$0.045/RCA)                                   │
│   • HIGH/MEDIUM: Claude Haiku (~$0.003/RCA)                                 │
│   • LOW: Template-based ($0)                                                │
│                                                                             │
│   Output: Structured RCA with confidence                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Sprint Breakdown

| Sprint | Focus | Points | Stories |
|--------|-------|--------|---------|
| **Sprint 1** | Foundation | 21 | Schema, Webhook, Index Workflow, Chunking |
| **Sprint 2** | Vector Search | 21 | pgvector, Embeddings, Search, Caching |
| **Sprint 3** | RCA Engine | 26 | Trace Analysis, Correlation, LLM, Storage |
| **Sprint 4** | Integration | 13 | Notifications, Dashboard, Manual Trigger |
| **Sprint 5** | Eval Pipeline | 8 | Auto-eval on PR, Regression Detection |

---

## Sub-Tickets

| ID | Sprint | Title | Points | Priority |
|----|--------|-------|--------|----------|
| #128 | 1 | Database schema for GitHub indexing | 3 | P0 |
| #129 | 1 | GitHub webhook receiver endpoint | 5 | P0 |
| #130 | 1 | Temporal workflow: basic indexing | 8 | P0 |
| #131 | 1 | Code chunking utility | 5 | P0 |
| #132 | 2 | pgvector setup + migrations | 3 | P0 |
| #133 | 2 | Embedding generation activity | 5 | P0 |
| #134 | 2 | Vector similarity search | 8 | P0 |
| #135 | 2 | Embedding caching by content hash | 5 | P1 |
| #136 | 3 | Trace analysis activity | 8 | P0 |
| #137 | 3 | Change correlation algorithm | 8 | P0 |
| #138 | 3 | LLM-based RCA generation | 8 | P0 |
| #139 | 3 | RCA storage and schema | 2 | P0 |
| #140 | 4 | RCA in alert notifications | 5 | P0 |
| #141 | 4 | RCA detail page in dashboard | 5 | P1 |
| #142 | 4 | Manual RCA trigger button | 3 | P2 |
| #143 | 5 | Eval workflow on PR merge | 5 | P2 |
| #144 | 5 | Regression detection | 3 | P2 |

---

## Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| RCA generation time | < 30s | P95 latency from alert to RCA |
| RCA usefulness | > 75% | User feedback (thumbs up) |
| Cost per RCA | < $0.05 | LLM + embedding API costs |
| Code correlation accuracy | > 85% | Relevant code in top 10 |
| MTTR reduction | -40% | Before/after comparison |

---

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Embedding Model | text-embedding-3-small | Best cost/performance ($0.02/1M tokens) |
| Vector DB | pgvector | No extra infra, HNSW indexing |
| LLM Provider | Anthropic Claude | Existing integration, structured output |
| Chunking | AST-based | Better retrieval vs fixed-size |
| GitHub Integration | GitHub App | Webhooks, fine-grained permissions |

---

## Dependencies

- **#115 Temporal Migration** - Workflow orchestration ✅
- **#90-93 Alerting System** - Alert history table ✅
- **pgvector Docker image** - `pgvector/pgvector:pg16`
- **OpenAI API key** - For embeddings
- **Anthropic API key** - For LLM reasoning
- **GitHub App credentials** - For webhook integration

---

## Getting Started

After implementation, users will:

1. **Connect GitHub**: Link repository to project in settings
2. **Automatic indexing**: Code indexed on every push
3. **Enhanced alerts**: Receive RCA with every alert
4. **Review RCA**: Click through to detailed analysis
5. **Provide feedback**: Help improve future analyses

---

## Future Enhancements (Out of Scope)

- Multi-repository correlation
- Custom eval suite definitions
- Self-hosted LLM support
- Automated remediation actions
- RCA analytics dashboard
- Slack/PagerDuty deep integration
