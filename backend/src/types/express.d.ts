import type { Logger } from "pino";

declare global {
  namespace Express {
    interface Request {
      traceId: string;
      log: Logger;
      userId?: string;
      userRole?: import("@prisma/client").UserRole;
    }
  }
}

export {};
