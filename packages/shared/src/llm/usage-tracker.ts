/**
 * LLM Usage Tracker
 *
 * Tracks LLM usage events and maintains running statistics.
 * Provides O(1) access to aggregated stats.
 */

import type { UsageEvent, UsageStats, OperationType, ProviderName } from "./types";

// ============================================
// Constants
// ============================================

/** Maximum number of usage events to retain (prevents memory leak) */
const MAX_USAGE_EVENTS = 1000;

// ============================================
// Types
// ============================================

export interface UsageTrackerConfig {
  /** Enable/disable tracking (default: true) */
  enabled?: boolean;
  /** Callback when usage event is recorded */
  onUsage?: (event: UsageEvent) => void;
}

export interface TrackUsageInput {
  provider: ProviderName;
  model: string;
  operation: OperationType;
  tokens: {
    prompt?: number;
    completion?: number;
    total: number;
  };
  cost: number;
  latencyMs: number;
  success: boolean;
  error?: string;
}

// ============================================
// Usage Tracker Class
// ============================================

/**
 * Tracks LLM usage and maintains running statistics.
 *
 * Features:
 * - O(1) stat updates and retrieval
 * - Memory-bounded event storage
 * - Per-provider and per-operation breakdowns
 * - Optional callback on each usage event
 */
export class UsageTracker {
  private config: UsageTrackerConfig;
  private events: UsageEvent[] = [];
  private stats: UsageStats = this.createEmptyStats();

  constructor(config: UsageTrackerConfig = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      onUsage: config.onUsage,
    };
  }

  /**
   * Track a usage event and update running stats.
   *
   * @param input - Usage event data (without timestamp)
   */
  track(input: TrackUsageInput): void {
    if (!this.config.enabled) return;

    const event: UsageEvent = {
      ...input,
      timestamp: new Date(),
    };

    // Store event (with cap to prevent memory leak)
    this.events.push(event);
    if (this.events.length > MAX_USAGE_EVENTS) {
      this.events = this.events.slice(-MAX_USAGE_EVENTS);
    }

    // Update running stats (O(1) updates)
    this.updateStats(event);

    // Call external callback if configured
    this.config.onUsage?.(event);
  }

  /**
   * Get aggregated usage statistics.
   * O(1) complexity - returns pre-computed running totals.
   *
   * @returns Copy of usage stats (safe to mutate)
   */
  getStats(): UsageStats {
    return {
      ...this.stats,
      byProvider: { ...this.stats.byProvider },
      byOperation: { ...this.stats.byOperation },
    };
  }

  /**
   * Get raw usage events.
   *
   * @returns Copy of all usage events
   */
  getEvents(): UsageEvent[] {
    return [...this.events];
  }

  /**
   * Get recent events (last N).
   *
   * @param count - Number of recent events to return
   * @returns Recent usage events
   */
  getRecentEvents(count: number): UsageEvent[] {
    return this.events.slice(-count);
  }

  /**
   * Clear usage history and reset stats.
   */
  clear(): void {
    this.events = [];
    this.stats = this.createEmptyStats();
  }

  /**
   * Check if tracking is enabled.
   */
  isEnabled(): boolean {
    return this.config.enabled ?? true;
  }

  /**
   * Enable or disable tracking.
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  // ============================================
  // Private Methods
  // ============================================

  private createEmptyStats(): UsageStats {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      byProvider: {},
      byOperation: {},
    };
  }

  private updateStats(event: UsageEvent): void {
    // Update totals
    this.stats.totalRequests++;
    if (event.success) {
      this.stats.successfulRequests++;
    } else {
      this.stats.failedRequests++;
    }
    this.stats.totalTokens += event.tokens.total;
    this.stats.totalCost += event.cost;

    // Update by-provider stats
    this.updateProviderStats(event);

    // Update by-operation stats
    this.updateOperationStats(event);
  }

  private updateProviderStats(event: UsageEvent): void {
    let providerStats = this.stats.byProvider[event.provider];
    if (!providerStats) {
      providerStats = { requests: 0, tokens: 0, cost: 0 };
      this.stats.byProvider[event.provider] = providerStats;
    }
    providerStats.requests++;
    providerStats.tokens += event.tokens.total;
    providerStats.cost += event.cost;
  }

  private updateOperationStats(event: UsageEvent): void {
    let operationStats = this.stats.byOperation[event.operation];
    if (!operationStats) {
      operationStats = { requests: 0, tokens: 0, cost: 0 };
      this.stats.byOperation[event.operation] = operationStats;
    }
    operationStats.requests++;
    operationStats.tokens += event.tokens.total;
    operationStats.cost += event.cost;
  }
}

/**
 * Create a new usage tracker instance.
 *
 * @param config - Tracker configuration
 * @returns UsageTracker instance
 */
export function createUsageTracker(config?: UsageTrackerConfig): UsageTracker {
  return new UsageTracker(config);
}
