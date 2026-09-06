import * as z from "zod";

const serverEnvironment = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }).optional(),
  ALLOWED_ORIGINS: z
    .string()
    .default("http://localhost:5173")
    .transform((value) => value.split(",").map((origin) => origin.trim()))
    .refine((origins) => origins.every(Boolean), "must not contain an empty origin"),
  TRUSTED_CLIENT_HEADER: z.string().min(1).optional(),
});

export type ServerConfig = z.infer<typeof serverEnvironment>;

/** Absent DATABASE_URL means the embedded database, which is what a first run gets. */
export function parseServerConfig(source: Record<string, string | undefined>): ServerConfig {
  const result = serverEnvironment.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment.\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
