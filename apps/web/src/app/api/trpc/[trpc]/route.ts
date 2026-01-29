import { handleTRPCRequest } from "@/lib/trpc/server";

/**
 * tRPC API route handler.
 * Handles all tRPC requests at /api/trpc/*
 */
export const GET = handleTRPCRequest;
export const POST = handleTRPCRequest;
