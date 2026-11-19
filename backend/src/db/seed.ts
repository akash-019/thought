/**
 * File: src/db/seed.ts
 *
 * Demo data so the app can be tried straight away (`npm run seed`, or SEED_DEMO_DATA=true).
 * Creates fictional professionals in three timezones (with working hours), two members, and a
 * few booked sessions. Does nothing if any users already exist. All people and emails are made up.
 * Every account's password is "password123".
 */
import { DateTime } from 'luxon';
import type { DataSource } from 'typeorm';
import { toAuthUser } from '../modules/auth/auth.middleware.js';
import { hashPassword } from '../modules/auth/password.js';
import { UserEntity, type User } from '../modules/auth/user.model.js';
import { AvailabilityRuleEntity } from '../modules/availability/availability-rule.model.js';
import { generateSlots } from '../modules/availability/slots.js';
import { loadWeeklyRules } from '../modules/availability/weekly-hours.js';
import { bookSession } from '../modules/sessions/booking.js';

export const DEMO_PASSWORD = 'password123';

const PROFESSIONALS = [
  {
    name: 'Dr Maya Lindqvist',
    email: 'maya@example.com',
    timezone: 'Europe/London',
    bio: 'Counsellor for anxiety, stress and big life changes.',
    // Monday to Friday, with a lunch break.
    hours: [1, 2, 3, 4, 5].flatMap((weekday) => [
      { weekday, start: '09:00', end: '13:00' },
      { weekday, start: '14:00', end: '17:00' },
    ]),
  },
  {
    name: 'Arjun Mehta',
    email: 'arjun@example.com',
    timezone: 'Asia/Kolkata',
    bio: 'Coach for burnout, sleep and work-life balance.',
    hours: [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start: '10:00', end: '18:00' })),
  },
  {
    name: 'Dr Sofia Ramirez',
    email: 'sofia@example.com',
    timezone: 'America/New_York',
    bio: 'Psychologist working with grief and relationships.',
    hours: [2, 3, 4].map((weekday) => ({ weekday, start: '12:00', end: '20:00' })),
  },
];

const MEMBERS = [
  { name: 'Sam Taylor', email: 'sam@example.com', timezone: 'Asia/Singapore' },
  { name: 'Priya Nair', email: 'priya@example.com', timezone: 'America/Los_Angeles' },
];

export async function seedDemoData(db: DataSource): Promise<boolean> {
  if ((await db.manager.count(UserEntity)) > 0) return false;
  const now = new Date();
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const pros: User[] = [];
  for (const profile of PROFESSIONALS) {
    const pro = await db.manager.save(UserEntity, {
      name: profile.name,
      email: profile.email,
      timezone: profile.timezone,
      bio: profile.bio,
      passwordHash,
      role: 'professional' as const,
    });
    for (const range of profile.hours) {
      await db.manager.insert(AvailabilityRuleEntity, { professionalId: pro.id, weekday: range.weekday, startLocal: range.start, endLocal: range.end });
    }
    pros.push(pro);
  }

  const members: User[] = [];
  for (const member of MEMBERS) {
    members.push(await db.manager.save(UserEntity, { ...member, bio: null, passwordHash, role: 'member' as const }));
  }

  // A few sessions: one soon (inside 24 hours, so it can no longer be changed), some later.
  const [sam, priya] = members as [User, User];
  const [maya, arjun, sofia] = pros as [User, User, User];
  await bookAround(db, sam, maya, now, 3);
  await bookAround(db, sam, arjun, now, 3 * 24);
  await bookAround(db, priya, sofia, now, 5 * 24);
  await bookAround(db, priya, maya, now, 8 * 24);
  return true;
}

/** Books the professional's first free slot at least `hoursAhead` hours from now. */
async function bookAround(db: DataSource, member: User, pro: User, now: Date, hoursAhead: number) {
  const from = DateTime.fromJSDate(now).plus({ hours: hoursAhead }).toJSDate();
  const [slot] = generateSlots({
    rules: await loadWeeklyRules(db.manager, pro.id),
    timezone: pro.timezone,
    from,
    to: DateTime.fromJSDate(from).plus({ days: 7 }).toJSDate(),
    earliestStart: from,
  });
  if (!slot) return;
  await bookSession(db, {
    member: toAuthUser(member),
    professionalId: pro.id,
    start: slot,
    now,
    settings: { minNoticeMinutes: 0 },
  }).catch(() => {}); // a clash with another demo session is fine to skip
}
