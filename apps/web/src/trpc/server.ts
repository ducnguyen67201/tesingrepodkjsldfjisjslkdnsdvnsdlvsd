import "server-only";

import { createCallerFactory, createContext, appRouter } from "@t3/api";

const createCaller = createCallerFactory(appRouter);

export const api = createCaller(createContext());
