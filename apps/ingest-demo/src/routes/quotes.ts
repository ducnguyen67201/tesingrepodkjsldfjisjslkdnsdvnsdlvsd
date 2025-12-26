/**
 * Quotes Route
 *
 * Fetches random quotes from zenquotes.io and creates manual spans.
 * Demonstrates multi-span traces with parent-child relationships.
 */
import { Router, type Request, type Response, type IRouter } from "express";
import { trace, SpanStatusCode, context } from "@opentelemetry/api";
import { createChildLogger } from "../lib/logger.js";

const router: IRouter = Router();
const tracer = trace.getTracer("demo-routes");
const log = createChildLogger({ route: "quotes" });

interface Quote {
  q: string; // Quote text
  a: string; // Author
  h: string; // HTML formatted
}

router.post("/quotes", async (_req: Request, res: Response) => {
  log.info("Quotes request received");

  // Start parent span
  const parentSpan = tracer.startSpan(
    "quotes.fetch",
    undefined,
    context.active()
  );

  try {
    log.debug("Fetching quote from zenquotes.io");
    // Child span: Fetch from API
    const fetchSpan = tracer.startSpan(
      "quotes.api_call",
      undefined,
      trace.setSpan(context.active(), parentSpan)
    );

    fetchSpan.setAttribute("quotes.api", "zenquotes.io");

    // Fetch random quote - auto-instrumented HTTP call
    const response = await fetch("https://zenquotes.io/api/random", {
      headers: {
        Accept: "application/json",
        "User-Agent": "Ducsigr-Demo/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Quotes API returned ${response.status}`);
    }

    const quotes = (await response.json()) as Quote[];
    const quote = quotes[0];

    if (!quote) {
      throw new Error("No quote received from API");
    }

    fetchSpan.setAttribute("quotes.count", quotes.length);
    fetchSpan.setStatus({ code: SpanStatusCode.OK });
    fetchSpan.end();

    // Child span: Process quote
    const processSpan = tracer.startSpan(
      "quotes.process",
      undefined,
      trace.setSpan(context.active(), parentSpan)
    );

    const wordCount = quote.q.split(/\s+/).length;
    const charCount = quote.q.length;

    processSpan.setAttribute("quotes.word_count", wordCount);
    processSpan.setAttribute("quotes.char_count", charCount);
    processSpan.setAttribute("quotes.author", quote.a);
    processSpan.setStatus({ code: SpanStatusCode.OK });
    processSpan.end();

    // Set parent span attributes
    parentSpan.setAttribute("quotes.success", true);
    parentSpan.setStatus({ code: SpanStatusCode.OK });

    log.info(
      { author: quote.a, wordCount, charCount },
      "Quote retrieved successfully"
    );

    res.json({
      success: true,
      traceId: parentSpan.spanContext().traceId,
      spanId: parentSpan.spanContext().spanId,
      data: {
        quote: quote.q,
        author: quote.a,
        stats: {
          wordCount,
          charCount,
        },
      },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    parentSpan.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });
    parentSpan.recordException(error as Error);

    log.error({ error: errorMessage }, "Quote fetch failed");

    res.status(500).json({
      success: false,
      traceId: parentSpan.spanContext().traceId,
      error: errorMessage,
    });
  } finally {
    parentSpan.end();
  }
});

export { router as quotesRouter };
