/**
 * File: src/notifications/notificationText.test.ts
 *
 * Tests: each notification type reads as a sentence, with the time in the reader's timezone.
 */
import { describe, expect, it } from 'vitest';
import type { AppNotification } from '../api/types';
import { notificationText } from './notificationText';

const note = (type: AppNotification['type']): AppNotification => ({
  id: '1',
  type,
  createdAt: '2026-11-18T10:00:00.000Z',
  readAt: null,
  session: {
    id: '9',
    startAt: '2026-11-19T17:00:00.000Z',
    endAt: '2026-11-19T17:50:00.000Z',
    status: 'booked',
    cancelledBy: null,
    counterpart: { name: 'Dr Sofia Ramirez', timezone: 'America/New_York' },
    canCancel: true,
    canReschedule: true,
  },
});

describe('notificationText', () => {
  it('writes reminders with the session time in the reader’s timezone', () => {
    expect(notificationText(note('reminder_1h'), 'Asia/Singapore')).toEqual({
      title: 'Your session starts in 1 hour',
      detail: 'With Dr Sofia Ramirez, Friday 20 November, 01:00',
    });
    expect(notificationText(note('reminder_24h'), 'America/New_York').detail).toBe(
      'With Dr Sofia Ramirez, Thursday 19 November, 12:00',
    );
  });

  it('has a sentence for every type', () => {
    expect(notificationText(note('session_booked'), 'UTC').title).toBe('New session booked');
    expect(notificationText(note('session_cancelled'), 'UTC').detail).toMatch(/^Dr Sofia Ramirez cancelled the session on/);
    expect(notificationText(note('session_rescheduled'), 'UTC').detail).toMatch(/moved their session to/);
  });
});
