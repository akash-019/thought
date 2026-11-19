/**
 * File: src/api/types.ts
 *
 * The shapes the backend API returns (see backend/openapi.yaml). All times are ISO strings in UTC.
 */
export type Role = 'member' | 'professional';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  timezone: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface Professional {
  id: string;
  name: string;
  bio: string | null;
  timezone: string;
}

export interface SlotDay {
  date: string; // YYYY-MM-DD in the member's timezone
  slots: { startAt: string; localTime: string }[];
}

export interface SlotsResponse {
  timezone: string;
  professionalTimezone: string;
  days: SlotDay[];
}

export interface Session {
  id: string;
  startAt: string;
  endAt: string;
  status: 'booked' | 'cancelled' | 'rescheduled';
  cancelledBy: Role | null;
  counterpart: { id?: string; name: string };
  canCancel: boolean;
  canReschedule: boolean;
}

export type NotificationType =
  | 'reminder_24h'
  | 'reminder_1h'
  | 'session_booked'
  | 'session_cancelled'
  | 'session_rescheduled';

export interface AppNotification {
  id: string;
  type: NotificationType;
  createdAt: string;
  readAt: string | null;
  session?: Session;
}

export interface WeeklyRule {
  weekday: number; // 1 = Monday ... 7 = Sunday
  start: string; // HH:MM
  end: string; // HH:MM
}
