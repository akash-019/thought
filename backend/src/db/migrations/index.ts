/**
 * File: src/db/migrations/index.ts
 *
 * The ordered list of database migrations TypeORM applies.
 */
import { UsersAndAuth1763510400001 } from './001_users_and_auth.js';
import { Availability1763510400002 } from './002_availability.js';
import { Sessions1763510400003 } from './003_sessions.js';
import { RemindersAndNotifications1763510400004 } from './004_reminders_and_notifications.js';
import { BlockedDates1763510400005 } from './005_blocked_dates.js';

/** Applied in this order. Each runs in its own transaction. */
export const MIGRATIONS = [UsersAndAuth1763510400001, Availability1763510400002, Sessions1763510400003, RemindersAndNotifications1763510400004, BlockedDates1763510400005];
