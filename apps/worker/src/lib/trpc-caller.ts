/**
 * Internal tRPC Caller
 *
 * This creates a server-side tRPC caller that can call API procedures directly
 * without HTTP. Used by Temporal activities to call internal procedures.
 *
 * Unlike client-side tRPC which uses HTTP, this runs in the same process
 * and calls procedures directly with proper context.
 */

import { appRouter, createCallerFactory } from "@ducsigr/api";
import { env } from "./env";

// Create caller factory from the app router
const createCaller = createCallerFactory(appRouter);

/**
 * Internal context for server-to-server calls.
 * Uses internal secret instead of user session.
 */
interface InternalContext {
  session: null;
  internalSecret: string;
}

// Infer the caller type from the factory
type Caller = ReturnType<typeof createCaller>;

// Singleton caller instance
let _caller: Caller | null = null;

/**
 * Get the singleton internal caller.
 * Creates the caller on first access with internal secret auth.
 * This caller can access internal.* procedures.
 */
export function getInternalCaller(): Caller {
  if (!_caller) {
    const ctx: InternalContext = {
      session: null,
      internalSecret: env.INTERNAL_API_SECRET,
    };
    _caller = createCaller(ctx);
  }
  return _caller;
}

/**
 * Type alias for the internal caller
 */
export type InternalCaller = Caller;
