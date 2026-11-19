/**
 * File: src/common/schemas.ts
 *
 * Request validation shared by several modules.
 */
import { z } from 'zod';

/** URL parameter `:id` (all ids are numeric strings). */
export const idParamSchema = z.object({ id: z.string().regex(/^\d+$/, 'Invalid id.') });
