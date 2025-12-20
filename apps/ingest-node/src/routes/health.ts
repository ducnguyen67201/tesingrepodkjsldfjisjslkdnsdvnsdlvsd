import { Router, type Router as RouterType } from "express";

export const healthRouter: RouterType = Router();

/**
 * Health check endpoint
 * Used by load balancers and orchestrators to verify service health
 */
healthRouter.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "ingest-node",
  });
});

/**
 * Readiness check endpoint
 * Returns 200 when the service is ready to accept traffic
 */
healthRouter.get("/ready", (_req, res) => {
  // TODO: Add database connectivity check
  res.json({
    status: "ready",
    timestamp: new Date().toISOString(),
  });
});

/**
 * Liveness check endpoint
 * Returns 200 if the service is running
 */
healthRouter.get("/live", (_req, res) => {
  res.json({
    status: "alive",
    timestamp: new Date().toISOString(),
  });
});
