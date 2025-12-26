import { getServerSession } from "next-auth";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter, type Context } from "@ducsigr/api";
import { authOptions } from "@/lib/auth/config";

/**
 * Creates the tRPC context for each request.
 * This is where we inject the session and other request-specific data.
 */
export async function createContext(): Promise<Context> {
  const session = await getServerSession(authOptions);
  return {
    session,
  };
}

/**
 * Handle tRPC requests via fetch adapter.
 * Used by the Next.js API route.
 */
export function handleTRPCRequest(req: Request) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext,
    onError({ error, path }) {
      console.error(`tRPC Error on "${path}":`, error);
    },
  });
}

// Export router for type inference
export { appRouter };
