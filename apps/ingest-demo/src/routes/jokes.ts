/**
 * Jokes Route
 *
 * Fetches dad jokes from icanhazdadjoke.com and creates manual spans.
 * Demonstrates simple span creation with timing attributes.
 */
import { Router, type Request, type Response, type IRouter } from "express";
import { trace, SpanStatusCode, context } from "@opentelemetry/api";

const router: IRouter = Router();
const tracer = trace.getTracer("demo-routes");

interface DadJoke {
  id: string;
  joke: string;
  status: number;
}

router.post("/jokes", async (_req: Request, res: Response) => {
  const startTime = Date.now();

  // Start a manual span
  const span = tracer.startSpan("jokes.fetch", undefined, context.active());

  try {
    span.setAttribute("jokes.api", "icanhazdadjoke.com");
    span.setAttribute("jokes.type", "dad_joke");

    // Fetch random joke - auto-instrumented HTTP call
    const response = await fetch("https://icanhazdadjoke.com/", {
      headers: {
        Accept: "application/json",
        "User-Agent": "CognObserve-Demo/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Jokes API returned ${response.status}`);
    }

    const joke = (await response.json()) as DadJoke;
    const duration = Date.now() - startTime;

    // Add result attributes
    span.setAttribute("jokes.id", joke.id);
    span.setAttribute("jokes.length", joke.joke.length);
    span.setAttribute("jokes.word_count", joke.joke.split(/\s+/).length);
    span.setAttribute("jokes.fetch_duration_ms", duration);
    span.setStatus({ code: SpanStatusCode.OK });

    res.json({
      success: true,
      traceId: span.spanContext().traceId,
      spanId: span.spanContext().spanId,
      data: {
        id: joke.id,
        joke: joke.joke,
        stats: {
          length: joke.joke.length,
          wordCount: joke.joke.split(/\s+/).length,
          fetchDurationMs: duration,
        },
      },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });
    span.recordException(error as Error);

    res.status(500).json({
      success: false,
      traceId: span.spanContext().traceId,
      error: errorMessage,
    });
  } finally {
    span.end();
  }
});

export { router as jokesRouter };
