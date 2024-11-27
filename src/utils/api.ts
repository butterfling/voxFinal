/**
 * This is the client-side entrypoint for your tRPC API.
 */
import { httpBatchLink, loggerLink } from "@trpc/client";
import { createTRPCNext } from "@trpc/next";
import { type inferRouterInputs, type inferRouterOutputs } from "@trpc/server";
import superjson from "superjson";

import { type AppRouter } from "@/server/api/root";

const getBaseUrl = () => {
  if (typeof window !== "undefined") {
    // In the browser, use relative URL
    return "";
  }
  // In development, use localhost
  if (process.env.NODE_ENV === "development") {
    return `http://127.0.0.1:${process.env.PORT ?? 3000}`;
  }
  // In production, use NEXTAUTH_URL
  return process.env.NEXTAUTH_URL || "";
};

/** A set of type-safe react-query hooks for your tRPC API. */
export const api = createTRPCNext<AppRouter>({
  config() {
    return {
      transformer: superjson,
      links: [
        loggerLink({
          enabled: (opts) =>
            process.env.NODE_ENV === "development" ||
            (opts.direction === "down" && opts.result instanceof Error),
        }),
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          fetch(url, options) {
            console.log('Making tRPC request to:', url, 'with options:', {
              ...options,
              headers: options?.headers,
            });
            return fetch(url, {
              ...options,
              credentials: 'include',
            });
          },
        }),
      ],
    };
  },
  ssr: false,
});

export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
