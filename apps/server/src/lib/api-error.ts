import { randomUUID } from "node:crypto";
import type { ApiError, ErrorCode } from "@wolfchatter/shared/schema";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * What a client sees is a code it can branch on and an id it can quote; the reason stays
 * on the server, logged against that id. No exception message, no SQL, no stack ever
 * crosses the wire, so an error tells the caller what to do without describing the server.
 * The body is typed as the shared schema, so the contract both sides read is checked here.
 */
export function failWith(c: Context, code: ErrorCode, status: ContentfulStatusCode, reason?: string) {
  const requestId = randomUUID();
  console.warn(
    `[${requestId}] ${status} ${code} ${c.req.method} ${c.req.path}${reason ? `\n${reason}` : ""}`,
  );
  const body: ApiError = { error: { code, requestId } };
  return c.json(body, status);
}
