import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  ACCESS_TOKEN_SECRET: z.string().min(32),
  REFRESH_TOKEN_SECRET: z.string().min(32),
  ACCESS_TOKEN_EXPIRES: z.string().default("15m"),
  REFRESH_TOKEN_EXPIRES: z.string().default("7d"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  /**
   * `lax` — same site as API (e.g. localhost + localhost). Default.
   * `none` — SPA on another origin (e.g. Vercel + API on Render). Requires `secure` cookies; set CORS to the exact web origin.
   */
  COOKIE_SAME_SITE: z.enum(["lax", "none"]).default("lax"),
  CSV_DUPLICATE_MODE: z.enum(["block", "warn"]).default("block"),
  UPLOAD_DIR: z.string().default("./uploads"),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables");
  }
  return parsed.data;
}
