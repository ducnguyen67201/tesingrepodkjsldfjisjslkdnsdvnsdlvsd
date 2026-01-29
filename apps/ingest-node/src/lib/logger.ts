import pino from "pino";
import { config } from "../config/env.js";

/**
 * Application logger configured for structured logging
 */
export const logger = pino({
  level: config.logging.level,
  formatters: {
    level: (label) => ({ level: label }),
    bindings: (bindings) => ({
      pid: bindings.pid,
      host: bindings.hostname,
      service: "ingest-node",
    }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(config.server.isDev && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      },
    },
  }),
});

/**
 * Create a child logger with additional context
 */
export function createLogger(context: Record<string, unknown>) {
  return logger.child(context);
}
