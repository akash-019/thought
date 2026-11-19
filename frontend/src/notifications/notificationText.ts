/**
 * File: src/notifications/notificationText.ts
 *
 * Turns a notification from the API into the sentence shown in the list. The backend stores
 * only the type and session, so the time is written here in the reader's own timezone.
 */
import type { AppNotification } from '../api/types';
import { formatDateTime } from '../lib/time';

export function notificationText(n: AppNotification, timezone: string): { title: string; detail: string } {
  const name = n.session?.counterpart.name ?? 'Someone';
  const when = n.session ? formatDateTime(n.session.startAt, timezone) : '';
  switch (n.type) {
    case 'reminder_24h':
      return { title: 'Your session is tomorrow', detail: `With ${name}, ${when}` };
    case 'reminder_1h':
      return { title: 'Your session starts in 1 hour', detail: `With ${name}, ${when}` };
    case 'session_booked':
      return { title: 'New session booked', detail: `${name}, ${when}` };
    case 'session_cancelled':
      return { title: 'Session cancelled', detail: `${name} cancelled the session on ${when}` };
    case 'session_rescheduled':
      return { title: 'Session moved', detail: `${name} moved their session to ${when}` };
  }
}
