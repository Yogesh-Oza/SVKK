import type { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/app-error.js";
import { ZodError } from "zod";

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  const traceId = req.traceId ?? "unknown";

  if (err instanceof AppError) {
    req.log?.warn({ err, code: err.code }, err.message);
    return res.status(err.statusCode).json({
      code: err.code,
      message: err.message,
      traceId,
    });
  }

  if (err instanceof ZodError) {
    req.log?.warn({ err: err.flatten() }, "validation failed");
    return res.status(400).json({
      code: "VALIDATION_ERROR",
      message: err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
      traceId,
    });
  }

  req.log?.error({ err }, "unhandled error");
  return res.status(500).json({
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred",
    traceId,
  });
}
