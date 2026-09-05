import { bodyLimit } from "hono/body-limit";
import { failWith } from "./api-error.ts";

const maximumBodyBytes = 16 * 1024;

/** Every write is capped before it is parsed, so an oversized body costs no validation work. */
export const limitBody = bodyLimit({
  maxSize: maximumBodyBytes,
  onError: (c) => failWith(c, "payload_too_large", 413),
});
