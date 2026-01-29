# Ducsigr Roadmap & Future Architecture

## Current Architecture (Phase 1 - MVP)

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌──────────┐
│   SDK   │────▶│ Ingest  │────▶│  Redis  │────▶│  Worker  │
│  (TS)   │HTTP │  (Go)   │     │  Queue  │     │   (TS)   │
└─────────┘     └─────────┘     └─────────┘     └────┬─────┘
                                                     │
                    ┌────────────────────────────────┘
                    │
                    ▼
              ┌──────────┐     ┌─────────┐
              │ Postgres │◀────│   Web   │
              │          │     │(Next.js)│
              └──────────┘     └─────────┘
```

**Capacity:** ~10K-50K traces/sec

**Good for:**
- MVP and early production
- Small to medium teams
- Validating product-market fit

---

## Phase 2 - Scale (Future)

### Queue Evolution

| Phase | Queue | Capacity | When to Upgrade |
|-------|-------|----------|-----------------|
| 1 (Current) | Redis LPUSH/BRPOP | ~10K msg/s | Now |
| 1.5 | Redis Streams | ~100K msg/s | When hitting Redis limits |
| 2 | Kafka/Redpanda | ~1M+ msg/s | When need replay, partitioning |

### Recommended: Redpanda (Kafka-compatible)

**Why Redpanda over Kafka:**
- Kafka-compatible API (easy migration)
- No JVM or ZooKeeper required
- Lower latency (<1ms vs 2-5ms)
- Single binary deployment
- Lower resource usage

```
┌─────────┐     ┌─────────┐     ┌──────────┐     ┌─────────┐
│   SDK   │────▶│ Ingest  │────▶│ Redpanda │────▶│ Workers │
│  (TS)   │     │  (Go)   │     │ (Kafka)  │     │  (x N)  │
└─────────┘     └─────────┘     └──────────┘     └────┬────┘
                                     │               │
                              ┌──────┴──────┐        │
                              ▼             ▼        ▼
                        ┌──────────┐  ┌──────────┐  ┌──────────┐
                        │ Alerts   │  │ Analytics│  │ Postgres │
                        │ Service  │  │ Pipeline │  │          │
                        └──────────┘  └──────────┘  └──────────┘
```

**Benefits:**
- **Replay**: Re-process traces when schema changes
- **Partitioning**: Scale workers by `project_id`
- **Retention**: Buffer traces during outages
- **Multi-consumer**: Feed analytics, alerts, ML pipelines

---

## Phase 3 - Analytics Scale

### Database Evolution

| Phase | Database | Use Case | Capacity |
|-------|----------|----------|----------|
| 1 (Current) | PostgreSQL | All data | ~10M traces |
| 2 | PostgreSQL + ClickHouse | Metadata + Analytics | ~1B traces |
| 3 | ClickHouse primary | High-cardinality analytics | ~100B+ traces |

### Why ClickHouse for Observability?

```
┌──────────────────────────────────────────────────────────────┐
│                     Data Flow (Phase 3)                      │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   Redpanda ──┬──▶ PostgreSQL (metadata, projects, users)    │
│              │                                               │
│              └──▶ ClickHouse (traces, spans, analytics)     │
│                        │                                     │
│                        ▼                                     │
│              ┌─────────────────┐                            │
│              │ Query patterns: │                            │
│              │ • P99 latency   │                            │
│              │ • Token usage   │                            │
│              │ • Error rates   │                            │
│              │ • Cost analysis │                            │
│              └─────────────────┘                            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**ClickHouse advantages:**
- Column-oriented (fast aggregations)
- 10-100x faster for analytics queries
- Excellent compression (lower storage costs)
- Built for time-series data
- Used by: PostHog, Cloudflare

---

## Queue Comparison Reference

| Queue | Throughput | Latency | Complexity | Replay | Best For |
|-------|------------|---------|------------|--------|----------|
| **Redis LPUSH** | ~50K/s | <1ms | Very Low | No | MVP |
| **Redis Streams** | ~100K/s | <1ms | Low | Limited | Simple scale |
| **Kafka** | ~1M+/s | 2-5ms | High | Yes | Enterprise |
| **Redpanda** | ~1M+/s | <1ms | Medium | Yes | Kafka without pain |
| **NATS** | ~1M+/s | <1ms | Low | Limited | Ultra-low latency |
| **RabbitMQ** | ~50K/s | <1ms | Medium | No | Complex routing |
| **AWS SQS** | ~30K/s | 10-50ms | Low | No | Serverless |

## What Others Use

| Platform | Queue | Database | Scale |
|----------|-------|----------|-------|
| **Jaeger** | Kafka | Cassandra/ES | Large |
| **Tempo** | Kafka | Object Storage | Large |
| **Datadog** | Kafka | Custom | Massive |
| **Honeycomb** | Kafka | Custom | Large |
| **PostHog** | Kafka | ClickHouse | Large |

---

## Implementation Strategy

### Current Code is Ready for Swap

The queue interface is already abstracted:

```go
// apps/ingest/internal/queue/producer.go
type Producer interface {
    PublishTrace(ctx context.Context, trace *model.Trace) error
    Close() error
}

// Current implementation
type RedisProducer struct { ... }

// Future implementation (same interface)
type KafkaProducer struct { ... }
type RedpandaProducer struct { ... }
```

### Migration Path

1. **Now**: Use Redis LPUSH/BRPOP (already implemented)
2. **10K+ traces/sec**: Upgrade to Redis Streams
3. **100K+ traces/sec**: Add Redpanda, keep Redis for cache
4. **Analytics needs**: Add ClickHouse for trace storage

### Configuration-Based Switching

```yaml
# Future: config.yaml
queue:
  driver: "redis"  # or "redpanda", "kafka"
  redis:
    url: "redis://localhost:6379"
  redpanda:
    brokers: ["localhost:9092"]
    topic: "ducsigr.traces"
```

---

## Cost Considerations

### Self-Hosted

| Component | MVP | Scale |
|-----------|-----|-------|
| Redis | 1 instance | Cluster |
| Kafka/Redpanda | - | 3+ brokers |
| PostgreSQL | 1 instance | Primary + replicas |
| ClickHouse | - | 3+ nodes |

### Managed Services

| Service | Provider | Cost Model |
|---------|----------|------------|
| Redis | Upstash, Redis Cloud | Pay-per-request |
| Kafka | Confluent, AWS MSK | Per-partition-hour |
| Redpanda | Redpanda Cloud | Per-partition-hour |
| ClickHouse | ClickHouse Cloud | Storage + compute |
| PostgreSQL | Supabase, Neon, RDS | Instance-based |

---

## Recommended Timeline

| Phase | Milestone | Trigger |
|-------|-----------|---------|
| **1** | MVP Launch | Now |
| **1.5** | Redis Streams | >10K traces/sec |
| **2** | Redpanda | >100K traces/sec OR need replay |
| **3** | ClickHouse | Analytics queries slow OR >1B traces |

---

## Future Features Roadmap

### Near-term
- [ ] Authentication (API keys)
- [ ] Basic dashboard
- [ ] SDK (TypeScript)
- [ ] Trace visualization

### Medium-term
- [ ] Alerting system
- [ ] Cost tracking
- [ ] User management
- [ ] Python SDK

### Long-term
- [ ] Real-time streaming
- [ ] ML-powered insights
- [ ] Custom dashboards
- [ ] Prompt management
- [ ] A/B testing for prompts
