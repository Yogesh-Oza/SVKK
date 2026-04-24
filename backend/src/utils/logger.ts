import pino from "pino";
import type { Env } from "../config/env.js";

export function createRootLogger(env: Env) {
  return pino({
    level: env.NODE_ENV === "production" ? "info" : "debug",
    formatters: {
      level(label) {
        return { level: label };
      },
    },
    redact: ["req.headers.authorization", "req.headers.cookie", "password", "passwordHash"],
  });
}

export type AppLogger = ReturnType<typeof createRootLogger>;
