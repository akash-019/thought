/**
 * File: src/App.tsx
 *
 * All pages and who can see them.
 * - Logged out: /login, /signup
 * - Members: find a professional, book, my sessions, reschedule
 * - Professionals: schedule, availability
 * The router is rebuilt when the user logs in or out, so each role only has its own pages.
 */
import { useMemo } from 'react';
import { createBrowserRouter, createRoutesFromElements, Navigate, Route, RouterProvider } from 'react-router';
import type { Role } from './api/types';
import { useAuth } from './auth/AuthContext';
import { LoginPage } from './auth/LoginPage';
import { SignupPage } from './auth/SignupPage';
import { AvailabilityPage } from './availability/AvailabilityPage';
import { Layout } from './components/Layout';
import { Loading } from './components/States';
import { ProfessionalPage } from './professionals/ProfessionalPage';
import { ProfessionalsPage } from './professionals/ProfessionalsPage';
import { MySessionsPage } from './sessions/MySessionsPage';
import { ReschedulePage } from './sessions/ReschedulePage';

/** Where each role lands after logging in. */
const HOME: Record<Role, string> = { member: '/professionals', professional: '/schedule' };

export function App() {
  const { user, loading } = useAuth();
  const router = useMemo(() => createBrowserRouter(createRoutesFromElements(routesFor(user?.role))), [user?.role]);
  if (loading) return <Loading label="Opening…" />;
  // `key` remounts the router on log in / log out; RouterProvider keeps stale state if only `router` changes.
  return <RouterProvider key={user?.role ?? 'guest'} router={router} />;
}

function routesFor(role: Role | undefined) {
  if (!role) {
    return (
      <>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </>
    );
  }
  return (
    <>
      <Route element={<Layout />}>
        {role === 'member' ? (
          <>
            <Route path="/professionals" element={<ProfessionalsPage />} />
            <Route path="/professionals/:id" element={<ProfessionalPage />} />
            <Route path="/sessions" element={<MySessionsPage />} />
            <Route path="/sessions/:id/reschedule" element={<ReschedulePage />} />
          </>
        ) : (
          <>
            <Route path="/schedule" element={<MySessionsPage />} />
            <Route path="/availability" element={<AvailabilityPage />} />
          </>
        )}
      </Route>
      <Route path="*" element={<Navigate to={HOME[role]} replace />} />
    </>
  );
}
