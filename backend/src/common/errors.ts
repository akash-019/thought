/**
 * File: src/common/errors.ts
 *
 * Error helpers shared by all features.
 * - HttpError + shortcuts (badRequest, notFound, ...) that routes throw.
 * - errorHandler: turns any thrown error into a `{ error: { code, message } }` JSON response.
 */
import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

/** An error that becomes an HTTP response. `code` is a stable name the frontend can check. */
class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (code: string, message: string) => new HttpError(400, code, message);
export const unauthorized = (code = 'UNAUTHENTICATED', message = 'Please log in.') => new HttpError(401, code, message);
export const forbidden = (code: string, message: string) => new HttpError(403, code, message);
export const notFound = (message = 'Not found.') => new HttpError(404, 'NOT_FOUND', message);
export const conflict = (code: string, message: string) => new HttpError(409, code, message);

/** Last middleware in the app: every error leaves the API in the same shape. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
  } else if (err instanceof ZodError) {
    // Invalid input: report the first problem, e.g. "startAt: Invalid ISO datetime".
    const issue = err.issues[0]!;
    const field = issue.path.length ? `${issue.path.join('.')}: ` : '';
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: field + issue.message } });
  } else if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON.' } });
  } else if (err?.type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'BODY_TOO_LARGE', message: 'Request body is too large.' } });
  } else {
    console.error(err); // unexpected: log it, but never send internals to the client
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } });
  }
};

/**
 * Postgres error code of a failed query (TypeORM copies it onto the error it throws).
 * 23505 = unique value already exists, 23P01 = exclusion constraint (overlapping sessions).
 */
export function dbError(err: unknown): { code?: string; constraint?: string } {
  const failure = err as { code?: string; constraint?: string } | undefined;
  return { code: failure?.code, constraint: failure?.constraint };
}
