# Automated RCA System with GitHub Integration - Epic Specification

**Epic ID:** #127
**Epic Name:** Automated Root Cause Analysis (RCA) with GitHub Project Indexing
**Total Story Points:** 89
**Estimated Sprints:** 5 sprints (2-week cadence)
**Priority:** P0
**Dependencies:** #115 (Temporal Migration), #90-93 (Alerting System)

---

## 1. Executive Summary

### Problem Statement

When alerts fire in Ducsigr (error rate spikes, latency degradation, etc.), users currently receive notifications but must manually investigate the root cause. This investigation is time-consuming and requires:

1. Correlating alert timing with recent deployments
2. Analyzing trace/span data during the incident window
3. Reviewing recent code changes (commits, PRs)
4. Identifying patterns across historical alerts

### Solution

Build an **Automated RCA (Root Cause Analysis) System** that:

1. **Indexes GitHub repositories** for semantic code search
2. **Correlates alerts with code changes** automatically
3. **Analyzes trace patterns** during incident windows
4. **Generates actionable RCA reports** using LLM reasoning
5. **Delivers RCA alongside alert notifications**

### Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| RCA generation time | < 30 seconds | P95 latency |
| RCA usefulness | > 75% | User feedback (thumbs up/down) |
| Cost per RCA | < $0.05 | LLM + embedding costs |
| Code correlation accuracy | > 85% | Relevant code in top 10 results |
| Time to resolution (MTTR) | -40% | Before vs after comparison |

---

## 2. Architecture Overview

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

### Data Flow

```
1. GitHub Event (push/PR) → Webhook → Index Pipeline → Vector DB
2. Alert Fires → RCA Workflow triggered
3. RCA Workflow:
   a. Fetch affected traces/spans
   b. Search indexed code (vector similarity)
   c. Correlate with recent commits/PRs
   d. Generate RCA via LLM
   e. Store RCA result
4. Enhanced notification sent with RCA summary
```

### Temporal Workflow Architecture

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

---

## 3. Database Schema

### New Models

```prisma
model GitHubRepository {
  id            String   @id @default(cuid())
  projectId     String   @unique
  project       Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  owner         String   // GitHub org/user
  repo          String   // Repository name
  defaultBranch String   @default("main")
  webhookId     String?  // GitHub webhook ID
  webhookSecret String?  // For signature verification

  lastIndexedAt DateTime?
  indexStatus   IndexStatus @default(PENDING)

  commits       GitCommit[]
  pullRequests  GitPullRequest[]
  codeChunks    CodeChunk[]

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([projectId])
}

enum IndexStatus {
  PENDING
  INDEXING
  READY
  FAILED
}

model GitCommit {
  id           String   @id @default(cuid())
  repoId       String
  repo         GitHubRepository @relation(fields: [repoId], references: [id], onDelete: Cascade)

  sha          String
  message      String
  authorName   String
  authorEmail  String
  timestamp    DateTime

  filesChanged Json     // Array of { path, additions, deletions }

  pullRequestId String?
  pullRequest   GitPullRequest? @relation(fields: [pullRequestId], references: [id])

  rcaReferences AlertRCA[] @relation("CommitToRCA")

  @@unique([repoId, sha])
  @@index([repoId, timestamp])
}

model GitPullRequest {
  id           String   @id @default(cuid())
  repoId       String
  repo         GitHubRepository @relation(fields: [repoId], references: [id], onDelete: Cascade)

  number       Int
  title        String
  body         String?
  state        String   // open, closed, merged
  mergedAt     DateTime?
  authorLogin  String

  baseRef      String
  headRef      String

  commits      GitCommit[]
  rcaReferences AlertRCA[] @relation("PRToRCA")

  @@unique([repoId, number])
  @@index([repoId, mergedAt])
}

model CodeChunk {
  id           String   @id @default(cuid())
  repoId       String
  repo         GitHubRepository @relation(fields: [repoId], references: [id], onDelete: Cascade)

  filePath     String
  startLine    Int
  endLine      Int
  content      String   @db.Text
  contentHash  String   // For caching embeddings
  language     String?

  // pgvector embedding (1536 dimensions for text-embedding-3-small)
  embedding    Unsupported("vector(1536)")?

  lastCommitSha String
  updatedAt    DateTime @updatedAt

  @@index([repoId, filePath])
  @@index([contentHash])
}

model AlertRCA {
  id              String   @id @default(cuid())
  alertHistoryId  String   @unique
  alertHistory    AlertHistory @relation(fields: [alertHistoryId], references: [id], onDelete: Cascade)

  // Analysis results
  hypothesis      String   @db.Text  // Main root cause hypothesis
  confidence      Float    // 0-1 confidence score
  analysis        Json     // Detailed analysis breakdown

  // Correlations found
  relatedCommitIds  String[]  // Commit IDs
  relatedPRIds      String[]  // PR IDs
  relatedTraceIds   String[]  // Trace IDs
  codeSnippets      Json      // Relevant code snippets

  // LLM metadata
  modelUsed    String?
  tokensUsed   Int?
  latencyMs    Int?

  // User feedback
  helpful      Boolean?
  feedback     String?

  createdAt    DateTime @default(now())

  @@index([alertHistoryId])
}
```

### Schema Changes to Existing Models

```prisma
// Extend AlertHistory (add relation)
model AlertHistory {
  // ... existing fields ...
  rca          AlertRCA?  // One-to-one relation
}

// Extend Project (add relation)
model Project {
  // ... existing fields ...
  githubRepo   GitHubRepository?
}
```

---

## 4. Cost Optimization Strategy

### Tiered Processing Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ TIER 1: DETERMINISTIC (FREE)                                                │
│                                                                             │
│   • Temporal correlation: Commits within 24h of alert                       │
│   • Error pattern matching: Stack traces → file paths                       │
│   • Span metadata: Model names, endpoints from spans                        │
│   • Rule-based filtering: Skip unrelated file types                         │
│                                                                             │
│   Output: Candidate list (5-20 items)                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ TIER 2: EMBEDDING SEARCH (LOW COST)                                         │
│                                                                             │
│   • Embed error messages + stack traces                                     │
│   • Vector similarity against indexed code                                  │
│   • Cost: ~$0.001 per search                                                │
│                                                                             │
│   Output: Ranked code chunks (top 10)                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ TIER 3: LLM REASONING (SMART COST)                                          │
│                                                                             │
│   Model Selection by Severity:                                              │
│   • CRITICAL alerts: Claude Sonnet (~$0.03/RCA)                             │
│   • HIGH/MEDIUM alerts: Claude Haiku (~$0.005/RCA)                          │
│   • LOW alerts: Skip LLM, use template-based RCA                            │
│                                                                             │
│   Output: Structured RCA with confidence                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Cost Projections

| Component | Per Alert Cost | Monthly (100 alerts) |
|-----------|---------------|---------------------|
| Tier 1: Deterministic | $0.00 | $0.00 |
| Tier 2: Embeddings | $0.001 | $0.10 |
| Tier 3: LLM (mixed severity) | $0.015 avg | $1.50 |
| **Total** | **$0.016** | **$1.60** |

### Indexing Cost Optimizations

| Strategy | Implementation | Savings |
|----------|---------------|---------|
| Incremental Indexing | Only process changed files | 90% vs full re-index |
| Embedding Caching | Cache by content hash | 70% on repeated content |
| Smart Chunking | Skip non-code files (.md, .json, etc.) | 40% fewer chunks |
| Batch Embeddings | Up to 100 chunks per API call | 50% fewer API calls |

---

## 5. Sprint Breakdown

### Sprint 1: Foundation (21 points)
- Database schema for GitHub indexing
- GitHub webhook receiver endpoint
- Temporal workflow: basic indexing
- Code chunking utility

### Sprint 2: Vector Search (21 points)
- pgvector setup + migrations
- Embedding generation activity
- Vector similarity search
- Embedding caching by content hash

### Sprint 3: RCA Engine (26 points)
- Trace analysis activity
- Change correlation algorithm
- LLM-based RCA generation
- RCA storage and schema

### Sprint 4: Integration & Notifications (13 points)
- RCA in alert notifications
- RCA detail page in dashboard
- Manual RCA trigger button

### Sprint 5: Eval Pipeline (8 points) - Optional
- Eval workflow triggered on PR merge
- Regression detection

---

## 6. Sub-Tickets

| Ticket ID | Sprint | Title | Points | Priority |
|-----------|--------|-------|--------|----------|
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
| #143 | 5 | Eval workflow triggered on PR merge | 5 | P2 |
| #144 | 5 | Regression detection | 3 | P2 |

---

## 7. Technical Decisions

### Embedding Model
- **Choice:** OpenAI `text-embedding-3-small`
- **Rationale:** Best cost/performance ratio, 1536 dimensions, $0.02/1M tokens

### Vector Database
- **Choice:** pgvector extension in existing PostgreSQL
- **Rationale:** No additional infrastructure, HNSW indexing for fast similarity search

### LLM Provider
- **Choice:** Anthropic Claude (Haiku/Sonnet)
- **Rationale:** Already integrated in Ducsigr, structured output support, cost-effective

### Code Chunking Strategy
- **Choice:** AST-based semantic chunking
- **Rationale:** Preserves function/class boundaries, better retrieval accuracy than fixed-size

### GitHub Integration
- **Choice:** GitHub App with webhooks
- **Rationale:** Fine-grained permissions, real-time updates, better than polling

---

## 8. Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| LLM costs exceed budget | High | Medium | Tiered processing, severity-based model selection |
| False positive correlations | Medium | Medium | Confidence scoring, user feedback loop |
| Large repos slow indexing | Medium | High | Incremental indexing, file type filtering |
| GitHub rate limits | Low | Medium | Webhook-based (not polling), exponential backoff |
| pgvector performance | Medium | Low | HNSW index, limit to recent chunks |

---

## 9. Out of Scope (Future Enhancements)

- Multi-repository correlation
- Custom eval suite definitions
- Slack/PagerDuty deep integration
- Self-hosted LLM support
- Automated remediation actions
- RCA analytics dashboard

---

## 10. References

- [pgvector Documentation](https://github.com/pgvector/pgvector)
- [OpenAI Embeddings Guide](https://platform.openai.com/docs/guides/embeddings)
- [Temporal Workflow Patterns](https://docs.temporal.io/workflows)
- Ducsigr Alerting System: `/docs/specs/alerting/`
- Ducsigr Temporal Migration: `/docs/specs/infrastructure/115_TEMPORAL_MIGRATION_SPEC.md`
