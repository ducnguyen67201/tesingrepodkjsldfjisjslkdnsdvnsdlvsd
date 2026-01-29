/**
 * Pricing Service
 *
 * Service for looking up model pricing and calculating costs.
 */

import { prisma, Prisma } from "@ducsigr/db";

type Decimal = Prisma.Decimal;
const Decimal = Prisma.Decimal;
import { detectProvider, normalizeModelName } from "./providers";

export interface SpanCost {
  inputCost: Decimal;
  outputCost: Decimal;
  totalCost: Decimal;
  pricingId: string;
}

interface SpanTokens {
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
}

interface CachedPricing {
  pricing: {
    id: string;
    inputPricePerMillion: Decimal;
    outputPricePerMillion: Decimal;
  } | null;
  timestamp: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const pricingCache = new Map<string, CachedPricing>();

/**
 * Get pricing for a model. Returns null if no pricing found.
 */
async function getPricing(model: string) {
  const provider = detectProvider(model);
  const normalizedModel = normalizeModelName(model);
  const cacheKey = `${provider}:${normalizedModel}`;

  // Check cache
  const cached = pricingCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.pricing;
  }

  // Query database for current pricing
  const pricing = await prisma.modelPricing.findFirst({
    where: {
      provider,
      model: normalizedModel,
      effectiveFrom: { lte: new Date() },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
    },
    orderBy: { effectiveFrom: "desc" },
    select: {
      id: true,
      inputPricePerMillion: true,
      outputPricePerMillion: true,
    },
  });

  // Update cache
  pricingCache.set(cacheKey, { pricing, timestamp: Date.now() });

  return pricing;
}

/**
 * Calculate cost for a span.
 */
export async function calculateSpanCost(span: SpanTokens): Promise<SpanCost | null> {
  if (!span.model) return null;
  if (!span.promptTokens && !span.completionTokens) return null;

  const pricing = await getPricing(span.model);
  if (!pricing) return null;

  const inputTokens = span.promptTokens ?? 0;
  const outputTokens = span.completionTokens ?? 0;

  // Calculate costs: (tokens / 1,000,000) * price_per_million
  const inputCost = new Decimal(inputTokens)
    .div(1_000_000)
    .mul(pricing.inputPricePerMillion);

  const outputCost = new Decimal(outputTokens)
    .div(1_000_000)
    .mul(pricing.outputPricePerMillion);

  const totalCost = inputCost.add(outputCost);

  return {
    inputCost,
    outputCost,
    totalCost,
    pricingId: pricing.id,
  };
}

/**
 * Bulk calculate costs for multiple spans.
 */
export async function calculateBulkCosts(
  spans: Array<SpanTokens & { id: string }>
): Promise<Map<string, SpanCost>> {
  const results = new Map<string, SpanCost>();

  for (const span of spans) {
    const cost = await calculateSpanCost(span);
    if (cost) {
      results.set(span.id, cost);
    }
  }

  return results;
}

/**
 * Clear the pricing cache.
 */
export function clearPricingCache(): void {
  pricingCache.clear();
}
