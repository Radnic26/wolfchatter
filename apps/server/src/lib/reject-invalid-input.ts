import type { Context } from "hono";
import * as z from "zod";
import { failWith } from "./api-error.ts";

/**
 * Replaces the validator's own 400, which would echo the schema back to the caller and
 * hand an attacker a map of the API. The failing path is logged instead.
 */
export function rejectInvalidInput(
  result: { success: boolean; error?: unknown },
  c: Context,
): Response | undefined {
  if (result.success) {
    return undefined;
  }
  return failWith(c, "invalid_request", 400, z.prettifyError(result.error as z.core.$ZodError));
}
