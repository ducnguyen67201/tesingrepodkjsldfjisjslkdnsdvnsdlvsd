/**
 * SDK Test Route
 *
 * Tests the @ducsigr/sdk package by sending traces to the ingest service.
 * Demonstrates metadata tracking at various levels.
 */

import { Router, type Request, type Response } from "express";
import { Ducsigr } from "@ducsigr/sdk";
import { config } from "../config/env.js";
import { logger } from "../lib/logger.js";

const router = Router();

/**
 * POST /api/demo/sdk-test
 *
 * Test the SDK with comprehensive metadata tracking
 */
router.post("/sdk-test", async (req: Request, res: Response) => {
  try {
    // SDK auto-initializes from env vars (DUCSIGR_API_KEY, DUCSIGR_ENDPOINT)
    const { message = "Hello from SDK test!", userId = "demo-user-123" } = req.body as {
      message?: string;
      userId?: string;
    };

    const requestId = `req-${Date.now()}`;
    const sessionId = `session-${Math.random().toString(36).substring(7)}`;

    // Use observe() with full metadata tracking
    const result = await Ducsigr.observe(
      {
        name: "sdk-test-trace",
        userId,
        sessionId,
        metadata: {
          source: "ingest-demo",
          environment: process.env.NODE_ENV || "development",
          requestId,
          testMessage: message,
          clientInfo: {
            userAgent: req.headers["user-agent"],
            ip: req.ip,
          },
        },
      },
      async () => {
        // Step 1: Data validation with metadata
        const step1Result = await Ducsigr.observe(
          {
            name: "step-1-validation",
            metadata: {
              inputLength: message.length,
              validationType: "message-check",
            },
          },
          async () => {
            await simulateWork(100);
            return {
              step: 1,
              status: "validated",
              isValid: message.length > 0,
            };
          }
        );

        // Step 2: LLM call with auto-extraction + custom metadata
        const step2Result = await Ducsigr.observe(
          {
            name: "step-2-llm-call",
            type: "generation",
            metadata: {
              promptVersion: "v2.1",
              temperature: 0.7,
              maxTokens: 150,
              purpose: "demo-response",
            },
          },
          async () => {
            await simulateWork(200);
            // Return mock LLM response format (tokens auto-extracted)
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

        // Step 3: Database operation with metadata
        const step3Result = await Ducsigr.observe(
          {
            name: "step-3-db-save",
            metadata: {
              operation: "insert",
              table: "responses",
              recordCount: 1,
            },
          },
          async () => {
            await simulateWork(50);
            return {
              step: 3,
              status: "saved",
              recordId: `rec-${Date.now()}`,
            };
          }
        );

        return {
          step1: step1Result,
          step2: step2Result,
          step3: step3Result,
          summary: {
            totalSteps: 3,
            completedAt: new Date().toISOString(),
          },
        };
      }
    );

    // Flush to ensure trace is sent
    await Ducsigr.flush();

    logger.info({ result, requestId }, "SDK test completed");

    res.json({
      success: true,
      message: "SDK trace sent successfully with metadata",
      requestId,
      sessionId,
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
 * Simple SDK test with basic metadata
 */
router.post("/sdk-test/simple", async (req: Request, res: Response) => {
  try {
    const result = await Ducsigr.observe(
      {
        name: "simple-test",
        metadata: {
          source: "ingest-demo",
          testType: "simple",
        },
      },
      async () => {
        await simulateWork(50);
        return { timestamp: new Date().toISOString(), status: "ok" };
      }
    );

    await Ducsigr.flush();

    res.json({
      success: true,
      message: "Simple SDK trace sent with metadata",
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
