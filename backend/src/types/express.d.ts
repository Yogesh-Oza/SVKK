import type { Logger } from "pino";

declare global {
  namespace Express {
    interface Request {
      traceId: string;
      log: Logger;
      userId?: string;
      roleId?: string;
      roleSlug?: string;
      roleName?: string;
      permissions?: Set<string>;
    }
  }
}

export {};
