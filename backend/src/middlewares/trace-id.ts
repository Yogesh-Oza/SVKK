import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import type { AppLogger } from "../utils/logger.js";

declare global {
  namespace Express {
    interface Request {
      traceId: string;
    }
  }
}

export function traceIdMiddleware(rootLog: AppLogger) {
  return (req: Request, res: Response, next: NextFunction) => {
    const id = (req.headers["x-request-id"] as string) || randomUUID();
    req.traceId = id;
    res.setHeader("x-trace-id", id);
    req.log = rootLog.child({ traceId: id });
    next();
  };
}
