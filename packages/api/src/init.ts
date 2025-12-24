/**
 * API Package Initialization
 *
 * Configures shared utilities and registers handlers/adapters.
 * This file MUST be imported before any routes that use these features.
 */

import { setApiKeyConfig } from "@cognobserve/shared";
import { initializeAlertingAdapters } from "./lib/alerting/init";
import { initializeExtensionHandlers } from "./lib/extensions/init";

// ============================================================================
// Configuration
// ============================================================================

setApiKeyConfig({
  prefix: process.env.API_KEY_PREFIX || "co_sk_",
  randomBytesLength: parseInt(process.env.API_KEY_RANDOM_BYTES_LENGTH || "32", 10),
  base62Charset:
    process.env.API_KEY_BASE62_CHARSET ||
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
});

// ============================================================================
// Handler & Adapter Registration
// ============================================================================

initializeAlertingAdapters();
initializeExtensionHandlers();
