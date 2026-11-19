/**
 * Weekly working hours. Times are wall-clock "HH:MM" strings in the professional's own timezone.
 * "24:00" is accepted as an end time meaning midnight at the end of the day.
 */
export interface WeeklyRule {
  weekday: number; // ISO weekday: 1 = Monday ... 7 = Sunday
  start: string; // "HH:MM"
  end: string; // "HH:MM"
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Minutes since local midnight for "HH:MM" (or "24:00"), or null when malformed. */
export function parseHHMM(value: string): number | null {
  if (value === '24:00') return 24 * 60;
  const m = HHMM.exec(value);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function formatHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Postgres TIME comes back as "HH:MM:SS"; the API speaks "HH:MM". */
export const timeFromDb = (value: string) => value.slice(0, 5);

export const MAX_RULES = 50;

/**
 * Checks a full weekly schedule and returns it sorted by weekday then start.
 * Returns a list of human-readable problems instead of throwing so the UI can show them all at once.
 */
export function validateWeeklyRules(rules: WeeklyRule[]): { ok: true; rules: WeeklyRule[] } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (rules.length > MAX_RULES) errors.push(`At most ${MAX_RULES} time ranges are allowed.`);

  const parsed = rules.map((r) => ({ ...r, startMin: parseHHMM(r.start), endMin: parseHHMM(r.end) }));
  for (const r of parsed) {
    if (!Number.isInteger(r.weekday) || r.weekday < 1 || r.weekday > 7) {
      errors.push(`Weekday must be 1 (Monday) to 7 (Sunday), got ${r.weekday}.`);
      continue;
    }
    if (r.startMin === null || r.start === '24:00') errors.push(`Invalid start time "${r.start}" (use HH:MM).`);
    if (r.endMin === null) errors.push(`Invalid end time "${r.end}" (use HH:MM).`);
    if (r.startMin !== null && r.endMin !== null && r.endMin <= r.startMin) {
      errors.push(`${r.start}-${r.end}: end must be after start (overnight ranges are not supported).`);
    }
  }
  if (errors.length) return { ok: false, errors };

  const sorted = [...parsed].sort((a, b) => a.weekday - b.weekday || a.startMin! - b.startMin!);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (prev.weekday === cur.weekday && cur.startMin! < prev.endMin!) {
      errors.push(`${prev.start}-${prev.end} overlaps ${cur.start}-${cur.end} on weekday ${cur.weekday}.`);
    }
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, rules: sorted.map(({ weekday, start, end }) => ({ weekday, start, end })) };
}
