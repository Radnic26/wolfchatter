import type { AppType } from "@wolfchatter/server/app";
import { hc } from "hono/client";
import type * as z from "zod";

/**
 * Same origin in development through Vite's proxy and in production behind the server that
 * serves this bundle, so there is no origin to configure and no CORS to allow.
 */
export const api = hc<AppType>("/").api;

/** The network is a boundary like any other: a response becomes a value only by parsing. */
export async function readJson<Parsed>(response: Response, schema: z.ZodType<Parsed>): Promise<Parsed> {
  if (!response.ok) {
    throw new Error(`${response.url} answered ${response.status}`);
  }
  return schema.parse(await response.json());
}
