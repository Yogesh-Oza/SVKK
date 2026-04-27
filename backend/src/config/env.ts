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
  /** Whitelisted path to medclaim static PDF; optional if served from Next public only */
  MEDCLAIM_PDF_PATH: z.string().optional(),
  /** Idempotency key retention (POST create policy); default 48h in code if unset */
  IDEMPOTENCY_TTL_HOURS: z.coerce.number().min(1).max(168).optional(),
  /** Default timezone label for asOf (document only; use UTC in SQL unless app shifts dates) */
  APP_TIMEZONE: z.string().optional(),
  /** Optional Redis for MIS/dashboard cache; omit to disable */
  REDIS_URL: z.string().optional(),
  /** JSON body and multipart max in bytes; default 2mb */
  MAX_UPLOAD_SIZE: z.coerce.number().min(1_000).default(2_000_000),
  /** Express JSON payload limit, e.g. 2mb */
  JSON_LIMIT: z.string().default("2mb"),
  /**
   * Google Drive (service account): folder ID where policy documents are uploaded.
   * Share the folder with the service account email (Editor). Optional; without it, `/upload/google-drive` returns 503.
   */
  GOOGLE_DRIVE_FOLDER_ID: z.string().optional(),
  /** Path to service account JSON key file (alternative to GOOGLE_SERVICE_ACCOUNT_JSON). */
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  /** Full service account JSON as a single line (use \\n in private_key). Optional if GOOGLE_APPLICATION_CREDENTIALS is set. */
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),
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
