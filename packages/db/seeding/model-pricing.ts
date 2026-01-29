/**
 * Model Pricing Seed
 *
 * Seeds the ModelPricing table with default pricing for major LLM providers.
 * Prices are in USD per 1M tokens (as of January 2025).
 */

import { prisma, Prisma } from "../src/index.js";

const Decimal = Prisma.Decimal;

interface PricingData {
  provider: string;
  model: string;
  displayName: string;
  inputPrice: number;
  outputPrice: number;
}

const DEFAULT_PRICING: PricingData[] = [
  // OpenAI
  { provider: "openai", model: "gpt-4o", displayName: "GPT-4o", inputPrice: 2.5, outputPrice: 10.0 },
  { provider: "openai", model: "gpt-4o-mini", displayName: "GPT-4o Mini", inputPrice: 0.15, outputPrice: 0.6 },
  { provider: "openai", model: "gpt-4-turbo", displayName: "GPT-4 Turbo", inputPrice: 10.0, outputPrice: 30.0 },
  { provider: "openai", model: "gpt-4", displayName: "GPT-4", inputPrice: 30.0, outputPrice: 60.0 },
  { provider: "openai", model: "gpt-3.5-turbo", displayName: "GPT-3.5 Turbo", inputPrice: 0.5, outputPrice: 1.5 },
  { provider: "openai", model: "o1", displayName: "o1", inputPrice: 15.0, outputPrice: 60.0 },
  { provider: "openai", model: "o1-mini", displayName: "o1 Mini", inputPrice: 3.0, outputPrice: 12.0 },

  // Anthropic
  { provider: "anthropic", model: "claude-3-5-sonnet", displayName: "Claude 3.5 Sonnet", inputPrice: 3.0, outputPrice: 15.0 },
  { provider: "anthropic", model: "claude-3-opus", displayName: "Claude 3 Opus", inputPrice: 15.0, outputPrice: 75.0 },
  { provider: "anthropic", model: "claude-3-sonnet", displayName: "Claude 3 Sonnet", inputPrice: 3.0, outputPrice: 15.0 },
  { provider: "anthropic", model: "claude-3-haiku", displayName: "Claude 3 Haiku", inputPrice: 0.25, outputPrice: 1.25 },

  // Google
  { provider: "google", model: "gemini-1.5-pro", displayName: "Gemini 1.5 Pro", inputPrice: 1.25, outputPrice: 5.0 },
  { provider: "google", model: "gemini-1.5-flash", displayName: "Gemini 1.5 Flash", inputPrice: 0.075, outputPrice: 0.3 },
  { provider: "google", model: "gemini-2.0-flash", displayName: "Gemini 2.0 Flash", inputPrice: 0.1, outputPrice: 0.4 },

  // Mistral
  { provider: "mistral", model: "mistral-large", displayName: "Mistral Large", inputPrice: 2.0, outputPrice: 6.0 },
  { provider: "mistral", model: "mistral-small", displayName: "Mistral Small", inputPrice: 0.2, outputPrice: 0.6 },
  { provider: "mistral", model: "mixtral-8x7b", displayName: "Mixtral 8x7B", inputPrice: 0.7, outputPrice: 0.7 },
];

const EFFECTIVE_DATE = new Date("2025-01-01T00:00:00Z");

export async function seedModelPricing(): Promise<void> {
  console.log("Seeding model pricing...");

  let created = 0;
  let updated = 0;

  for (const pricing of DEFAULT_PRICING) {
    const existing = await prisma.modelPricing.findFirst({
      where: {
        provider: pricing.provider,
        model: pricing.model,
        effectiveFrom: EFFECTIVE_DATE,
      },
    });

    if (existing) {
      await prisma.modelPricing.update({
        where: { id: existing.id },
        data: {
          displayName: pricing.displayName,
          inputPricePerMillion: new Decimal(pricing.inputPrice),
          outputPricePerMillion: new Decimal(pricing.outputPrice),
        },
      });
      updated++;
    } else {
      await prisma.modelPricing.create({
        data: {
          provider: pricing.provider,
          model: pricing.model,
          displayName: pricing.displayName,
          inputPricePerMillion: new Decimal(pricing.inputPrice),
          outputPricePerMillion: new Decimal(pricing.outputPrice),
          effectiveFrom: EFFECTIVE_DATE,
        },
      });
      created++;
    }
  }

  console.log(`  Created: ${created} pricing entries`);
  console.log(`  Updated: ${updated} pricing entries`);
  console.log(`  Total: ${DEFAULT_PRICING.length} models`);
}
