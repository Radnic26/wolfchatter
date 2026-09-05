import { randomUUID } from "node:crypto";
import type { ErrorCode } from "@wolfchatter/shared/schema";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * What a client sees is a code it can branch on and an id it can quote; the reason stays
 * on the server, logged against that id. No exception message, no SQL, no stack ever
 * crosses the wire, so an error tells the caller what to do without describing the server.
 */
export function failWith(c: Context, code: ErrorCode, status: ContentfulStatusCode, reason?: string) {
  const requestId = randomUUID();
  console.warn(
    `[${requestId}] ${status} ${code} ${c.req.method} ${c.req.path}${reason ? `\n${reason}` : ""}`,
  );
  return c.json({ error: { code, requestId } }, status);
}
