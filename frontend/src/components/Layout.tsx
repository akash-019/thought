/**
 * File: src/components/Layout.tsx
 *
 * The frame around every logged-in page: header with navigation (different for members and
 * professionals), the notification bell, and log out.
 */
import { NavLink, Outlet } from 'react-router';
import { useUser, useAuth } from '../auth/AuthContext';
import { cityOf } from '../lib/time';
import { NotificationBell } from '../notifications/NotificationBell';
import { Brand } from './Brand';

export function Layout() {
  const user = useUser();
  const { logout } = useAuth();
  const links =
    user.role === 'member'
      ? [
          { to: '/professionals', label: 'Find a professional' },
          { to: '/sessions', label: 'My sessions' },
        ]
      : [
          { to: '/schedule', label: 'Schedule' },
          { to: '/availability', label: 'Availability' },
        ];

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <Brand />
          <nav className="nav" aria-label="Main">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="topbar-end">
            <NotificationBell />
            <div className="account">
              <span className="account-name">{user.name}</span>
              <span className="account-zone">{cityOf(user.timezone)} time</span>
            </div>
            <button type="button" className="button button-quiet" onClick={logout}>
              Log out
            </button>
          </div>
        </div>
      </header>
      <main id="main" className="page">
        <Outlet />
      </main>
    </>
  );
}
