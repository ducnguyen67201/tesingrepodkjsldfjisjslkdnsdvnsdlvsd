import { Router, type Router as RouterType } from "express";
import { registry } from "../lib/metrics.js";

export const metricsRouter: RouterType = Router();

/**
 * Prometheus metrics endpoint
 * GET /metrics
 */
metricsRouter.get("/metrics", async (_req, res) => {
  try {
    res.set("Content-Type", registry.contentType);
    res.end(await registry.metrics());
  } catch (error) {
    res.status(500).end("Error collecting metrics");
  }
});
