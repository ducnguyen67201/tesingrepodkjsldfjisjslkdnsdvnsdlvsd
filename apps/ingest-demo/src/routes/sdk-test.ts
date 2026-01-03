/**
 * SDK Test Route
 *
 * Tests the @ducsigr/sdk package by sending traces to the ingest service.
 */

import { Router, type Request, type Response } from "express";
import { Ducsigr } from "@ducsigr/sdk";
import { config } from "../config/env.js";
import { logger } from "../lib/logger.js";

const router = Router();

/**
 * POST /api/demo/sdk-test
 *
 * Test the SDK by creating a trace with spans
 */
router.post("/sdk-test", async (req: Request, res: Response) => {
  try {
    // SDK auto-initializes from env vars (DUCSIGR_API_KEY, DUCSIGR_ENDPOINT)
    const { message = "Hello from SDK test!" } = req.body as {
      message?: string;
    };

    // Use observe() to create a trace
    const result = await Ducsigr.observe(
      {
        name: "sdk-test-trace",
        metadata: {
          source: "ingest-demo",
          testMessage: message,
        },
      },
      async () => {
        // Simulate some work with nested spans
        const step1Result = await Ducsigr.observe("step-1-processing", async () => {
          await simulateWork(100);
          return { step: 1, status: "completed" };
        });

        const step2Result = await Ducsigr.observe(
          {
            name: "step-2-llm-call",
            type: "generation",
          },
          async () => {
            await simulateWork(200);
            // Return mock LLM response format
            return {
              id: "mock-completion-id",
              model: "gpt-4-mock",
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: `Mock response to: ${message}`,
                  },
                },
              ],
              usage: {
                prompt_tokens: 10,
                completion_tokens: 25,
                total_tokens: 35,
              },
            };
          }
        );

        return {
          step1: step1Result,
          step2: step2Result,
        };
      }
    );

    // Flush to ensure trace is sent
    await Ducsigr.flush();

    logger.info({ result }, "SDK test completed");

    res.json({
      success: true,
      message: "SDK trace sent successfully",
      result,
      endpoint: config.ducsigr.endpoint,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logger.error({ error: errorMessage }, "SDK test failed");

    res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
});

/**
 * POST /api/demo/sdk-test/simple
 *
 * Simple SDK test with just one span
 */
router.post("/sdk-test/simple", async (req: Request, res: Response) => {
  try {
    const result = await Ducsigr.observe("simple-test", async () => {
      await simulateWork(50);
      return { timestamp: new Date().toISOString(), status: "ok" };
    });

    await Ducsigr.flush();

    res.json({
      success: true,
      message: "Simple SDK trace sent",
      result,
      endpoint: config.ducsigr.endpoint,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
});

/**
 * Simulate async work
 */
const simulateWork = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export { router as sdkTestRouter };
