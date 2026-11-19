/**
 * File: src/App.tsx
 *
 * All pages and who can see them.
 * - Logged out: /login, /signup
 * - Members: find a professional, book, my sessions, reschedule
 * - Professionals: schedule, availability
 */
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
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
  if (loading) return <Loading label="Opening…" />;

  return (
    <BrowserRouter>
      {!user ? (
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      ) : (
        <Routes>
          <Route element={<Layout />}>
            {user.role === 'member' ? (
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
          <Route path="*" element={<Navigate to={HOME[user.role]} replace />} />
        </Routes>
      )}
    </BrowserRouter>
  );
}
