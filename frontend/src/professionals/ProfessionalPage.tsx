/**
 * File: src/professionals/ProfessionalPage.tsx
 *
 * Members: a professional's profile, and booking a session with them
 * (pick a time, check the confirmation screen, book).
 */
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../api/client';
import type { Professional } from '../api/types';
import { useUser } from '../auth/AuthContext';
import { ErrorNote, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { initials } from '../lib/names';
import { cityOf, formatDateTime } from '../lib/time';
import { useLoad } from '../lib/useLoad';
import { usePageTitle } from '../lib/usePageTitle';
import { PickAndConfirm } from './PickAndConfirm';

export function ProfessionalPage() {
  const { id = '' } = useParams();
  const user = useUser();
  const navigate = useNavigate();
  const toast = useToast();
  const pro = useLoad(() => api<{ professional: Professional }>(`/professionals/${id}`).then((r) => r.professional), [id]);
  usePageTitle(pro.data?.name ?? 'Professional');

  if (pro.loading) return <Loading />;
  if (pro.error || !pro.data) return <ErrorNote message={pro.error ?? 'Professional not found.'} />;
  const professional = pro.data;

  async function book(startAt: string) {
    await api('/sessions', { method: 'POST', body: { professionalId: professional.id, startAt } });
    toast.show(`Session booked for ${formatDateTime(startAt, user.timezone)}`);
    navigate('/sessions');
  }

  return (
    <>
      <Link to="/professionals" className="back-link">
        All professionals
      </Link>
      <header className="profile">
        <span className="avatar avatar-large" aria-hidden="true">
          {initials(professional.name)}
        </span>
        <div>
          <h1>{professional.name}</h1>
          {professional.bio && <p className="lead">{professional.bio}</p>}
          <p className="muted">Based in {cityOf(professional.timezone)}</p>
        </div>
      </header>

      <PickAndConfirm
        professional={professional}
        text={{ pick: 'Choose a time', confirm: 'Confirm your session', button: 'Book session', busy: 'Booking…' }}
        note="You can cancel or reschedule up to 24 hours before it starts. You’ll get reminders 24 hours and 1 hour before."
        onConfirm={book}
      />
    </>
  );
}
