import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@t3/api";

export const trpc = createTRPCReact<AppRouter>();
