import type { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
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
    const logFn =
      err.code === "INVALID_TOKEN" ? req.log?.debug.bind(req.log) : req.log?.warn.bind(req.log);
    logFn?.({ err, code: err.code }, err.message);
    return res.status(err.statusCode).json({
      success: false,
      code: err.code,
      message: err.message,
      traceId,
    });
  }

  if (err instanceof ZodError) {
    req.log?.warn({ err: err.flatten() }, "validation failed");
    return res.status(400).json({
      success: false,
      code: "VALIDATION_ERROR",
      message: err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
      errors: err.errors,
      traceId,
    });
  }

  if (err instanceof SyntaxError && "status" in err && (err as SyntaxError & { status?: number }).status === 400) {
    req.log?.warn({ err }, "invalid JSON body");
    return res.status(400).json({
      success: false,
      code: "INVALID_JSON",
      message: "Request body must be valid JSON",
      traceId,
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
    req.log?.warn({ err, meta: err.meta }, "foreign key constraint");
    return res.status(409).json({
      success: false,
      code: "CONFLICT",
      message: "Cannot delete or update: this record is still in use.",
      traceId,
    });
  }

  req.log?.error({ err }, "unhandled error");
  return res.status(500).json({
    success: false,
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred",
    traceId,
  });
}
