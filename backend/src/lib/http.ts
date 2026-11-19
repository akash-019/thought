import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpError } from './errors.js';

/** Every error leaves the API as `{ error: { code, message } }`. Unexpected errors never leak details. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const where = first?.path.length ? `${first.path.join('.')}: ` : '';
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: `${where}${first?.message ?? 'Invalid input.'}`, issues: err.issues },
    });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON.' } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } });
};

/** Postgres error code helper (e.g. 23505 unique_violation, 23P01 exclusion_violation). */
export function pgCode(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : undefined;
}
