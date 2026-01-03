"use client";

import {
  createTRPCReact,
  httpBatchLink,
  loggerLink,
  type CreateTRPCReact,
} from "@trpc/react-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import superjson from "superjson";
import type { AppRouter } from "@ducsigr/api";

/**
 * tRPC React hooks
 */
export const trpc: CreateTRPCReact<AppRouter, unknown> =
  createTRPCReact<AppRouter>();

/**
 * Get the base URL for tRPC requests.
 */
function getBaseUrl() {
  if (typeof window !== "undefined") {
    // Browser should use relative url
    return "";
  }

  // SSR should use vercel url or localhost
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return `http://localhost:${process.env.PORT ?? 3000}`;
}

/**
 * Create tRPC client with links.
 */
function createTRPCClient() {
  return trpc.createClient({
    links: [
      // Log requests in development
      loggerLink({
        enabled: (opts) =>
          process.env.NODE_ENV === "development" ||
          (opts.direction === "down" && opts.result instanceof Error),
      }),
      // HTTP batching - combines multiple requests into one
      httpBatchLink({
        url: `${getBaseUrl()}/api/trpc`,
        transformer: superjson,
      }),
    ],
  });
}

/**
 * tRPC + React Query Provider
 */
export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 1000, // 5 seconds
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  const [trpcClient] = useState(() => createTRPCClient());

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
