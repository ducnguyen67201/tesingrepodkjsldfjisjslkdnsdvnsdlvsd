/**
 * Weather Route
 *
 * Fetches weather data from wttr.in and creates manual spans with attributes.
 * Demonstrates how external HTTP calls are auto-instrumented as child spans.
 */
import { Router, type Request, type Response, type IRouter } from "express";
import { trace, SpanStatusCode, context } from "@opentelemetry/api";
import { createChildLogger } from "../lib/logger.js";

const router: IRouter = Router();
const tracer = trace.getTracer("demo-routes");
const log = createChildLogger({ route: "weather" });

interface WeatherRequest {
  city?: string;
}

interface WeatherCondition {
  temp_C: string;
  temp_F: string;
  humidity: string;
  weatherDesc: Array<{ value: string }>;
}

interface WeatherResponse {
  current_condition: WeatherCondition[];
  nearest_area: Array<{
    areaName: Array<{ value: string }>;
    country: Array<{ value: string }>;
  }>;
}

router.post("/weather", async (req: Request, res: Response) => {
  const { city = "London" } = req.body as WeatherRequest;

  log.info({ city }, "Weather request received");

  // Start a manual span for this operation
  const span = tracer.startSpan("weather.fetch", undefined, context.active());

  try {
    // Add attributes to the span
    span.setAttribute("weather.city.requested", city);
    span.setAttribute("weather.api", "wttr.in");

    log.debug({ city, api: "wttr.in" }, "Fetching weather data");

    // Fetch weather data - this HTTP call will be auto-instrumented
    const response = await fetch(
      `https://wttr.in/${encodeURIComponent(city)}?format=j1`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "Ducsigr-Demo/1.0",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Weather API returned ${response.status}`);
    }

    const data = (await response.json()) as WeatherResponse;
    const current = data.current_condition[0];
    const area = data.nearest_area[0];

    if (!current || !area) {
      throw new Error("Invalid weather data received");
    }

    // Add result attributes
    span.setAttribute("weather.temp_c", parseInt(current.temp_C, 10));
    span.setAttribute("weather.temp_f", parseInt(current.temp_F, 10));
    span.setAttribute("weather.humidity", parseInt(current.humidity, 10));
    span.setAttribute(
      "weather.city.resolved",
      area.areaName[0]?.value ?? city
    );
    span.setAttribute("weather.country", area.country[0]?.value ?? "Unknown");
    span.setStatus({ code: SpanStatusCode.OK });

    const resolvedCity = area.areaName[0]?.value ?? city;
    const tempC = parseInt(current.temp_C, 10);

    log.info(
      {
        city: resolvedCity,
        country: area.country[0]?.value ?? "Unknown",
        temperature: tempC,
        condition: current.weatherDesc[0]?.value,
      },
      "Weather data retrieved successfully"
    );

    res.json({
      success: true,
      traceId: span.spanContext().traceId,
      spanId: span.spanContext().spanId,
      data: {
        city: area.areaName[0]?.value ?? city,
        country: area.country[0]?.value ?? "Unknown",
        temperature: {
          celsius: parseInt(current.temp_C, 10),
          fahrenheit: parseInt(current.temp_F, 10),
        },
        humidity: parseInt(current.humidity, 10),
        condition: current.weatherDesc[0]?.value ?? "Unknown",
      },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });
    span.recordException(error as Error);

    log.error({ city, error: errorMessage }, "Weather fetch failed");

    res.status(500).json({
      success: false,
      traceId: span.spanContext().traceId,
      error: errorMessage,
    });
  } finally {
    span.end();
  }
});

export { router as weatherRouter };
