import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../auth/middleware.js';
import type { AppDeps } from '../app.js';
import type { DB } from '../db/client.js';
import { timeFromDb, validateWeeklyRules, type WeeklyRule } from '../domain/availability.js';
import { HttpError } from '../lib/errors.js';

const putSchema = z.object({
  rules: z.array(z.object({ weekday: z.number().int(), start: z.string(), end: z.string() })),
});

export async function loadWeeklyRules(db: DB, professionalId: string): Promise<WeeklyRule[]> {
  const rows = await db
    .selectFrom('availability_rules')
    .select(['weekday', 'start_local', 'end_local'])
    .where('professional_id', '=', professionalId)
    .orderBy('weekday')
    .orderBy('start_local')
    .execute();
  return rows.map((r) => ({ weekday: r.weekday, start: timeFromDb(r.start_local), end: timeFromDb(r.end_local) }));
}

export function availabilityRoutes({ db }: AppDeps): Router {
  const router = Router();

  router.get('/me/availability', async (req, res) => {
    const pro = requireRole(req, 'professional');
    res.json({ timezone: pro.timezone, rules: await loadWeeklyRules(db, pro.id) });
  });

  /** Replaces the whole weekly schedule in one transaction. Already-booked sessions are not touched. */
  router.put('/me/availability', async (req, res) => {
    const pro = requireRole(req, 'professional');
    const result = validateWeeklyRules(putSchema.parse(req.body).rules);
    if (!result.ok) {
      throw new HttpError(400, 'INVALID_AVAILABILITY', result.errors.join(' '));
    }
    await db.transaction().execute(async (trx) => {
      await trx.deleteFrom('availability_rules').where('professional_id', '=', pro.id).execute();
      if (result.rules.length) {
        await trx
          .insertInto('availability_rules')
          .values(
            result.rules.map((r) => ({ professional_id: pro.id, weekday: r.weekday, start_local: r.start, end_local: r.end })),
          )
          .execute();
      }
    });
    res.json({ timezone: pro.timezone, rules: result.rules });
  });

  return router;
}
