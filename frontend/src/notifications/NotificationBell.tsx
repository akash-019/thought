/**
 * File: src/notifications/NotificationBell.tsx
 *
 * The bell in the header: shows how many notifications are unread and opens the list.
 * Checks for new notifications every 30 seconds (reminders are created by the backend worker).
 * New ones stay highlighted while the list is open and count as read once it is closed.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { AppNotification } from '../api/types';
import { useUser } from '../auth/AuthContext';
import { relative } from '../lib/time';
import { notificationText } from './notificationText';

const POLL_MS = 30_000;

export function NotificationBell() {
  const user = useUser();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await api<{ unreadCount: number; notifications: AppNotification[] }>('/notifications');
    setItems(res.notifications);
    setUnread(res.unreadCount);
  }, []);

  useEffect(() => {
    load().catch(() => {});
    const timer = window.setInterval(() => load().catch(() => {}), POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  /** Closing the list marks what was shown as read. */
  const close = useCallback(() => {
    setOpen(false);
    if (unread > 0) {
      api('/notifications/read-all', { method: 'POST' })
        .then(load)
        .catch(() => {});
    }
  }, [unread, load]);

  // Close on Escape or a click outside the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open, close]);

  return (
    <div className="bell" ref={panelRef}>
      <button
        type="button"
        className="bell-button"
        aria-expanded={open}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        onClick={() => {
          if (open) return close();
          setOpen(true);
          load().catch(() => {});
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 3a6 6 0 0 0-6 6v3.6L4.3 15.4A1 1 0 0 0 5.1 17h13.8a1 1 0 0 0 .8-1.6L18 12.6V9a6 6 0 0 0-6-6Zm-2 15a2 2 0 0 0 4 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </svg>
        {unread > 0 && <span className="bell-count">{unread}</span>}
      </button>

      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          <div className="bell-panel-head">
            <h2>Notifications</h2>
          </div>
          {items.length === 0 ? (
            <p className="bell-empty">Nothing yet. Reminders appear here 24 hours and 1 hour before each session.</p>
          ) : (
            <ul className="bell-list">
              {items.map((n) => {
                const text = notificationText(n, user.timezone);
                return (
                  <li key={n.id} className={n.readAt ? 'bell-item' : 'bell-item bell-item-unread'}>
                    <p className="bell-item-title">{text.title}</p>
                    <p className="bell-item-detail">{text.detail}</p>
                    <p className="bell-item-time">{relative(n.createdAt)}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
