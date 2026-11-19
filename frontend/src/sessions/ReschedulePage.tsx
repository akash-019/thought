/**
 * File: src/sessions/ReschedulePage.tsx
 *
 * Members: move a session to another time with the same professional.
 * Pick a new time, confirm, done. If the new time is taken, the original session is kept.
 */
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../api/client';
import type { Professional, Session } from '../api/types';
import { useUser } from '../auth/AuthContext';
import { ErrorNote, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { formatDateTime } from '../lib/time';
import { useLoad } from '../lib/useLoad';
import { usePageTitle } from '../lib/usePageTitle';
import { PickAndConfirm } from '../professionals/PickAndConfirm';

export function ReschedulePage() {
  const { id = '' } = useParams();
  const user = useUser();
  const navigate = useNavigate();
  const toast = useToast();
  usePageTitle('Reschedule');
  const { data, error, loading } = useLoad(async () => {
    const { session } = await api<{ session: Session }>(`/sessions/${id}`);
    const { professional } = await api<{ professional: Professional }>(`/professionals/${session.counterpart.id}`);
    return { session, professional };
  }, [id]);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorNote message={error ?? 'Session not found.'} />;
  const { session, professional } = data;

  const backLink = (
    <Link to="/sessions" className="back-link">
      My sessions
    </Link>
  );

  if (!session.canReschedule) {
    return (
      <>
        {backLink}
        <h1>This session can’t be moved</h1>
        <p className="lead">
          Sessions can only be rescheduled more than 24 hours before they start. If you can’t attend, please contact{' '}
          {professional.name}.
        </p>
      </>
    );
  }

  async function move(startAt: string) {
    await api(`/sessions/${session.id}/reschedule`, { method: 'POST', body: { startAt } });
    toast.show(`Session moved to ${formatDateTime(startAt, user.timezone)}`);
    navigate('/sessions');
  }

  return (
    <>
      {backLink}
      <h1>Reschedule with {professional.name}</h1>
      <p className="lead">
        Currently {formatDateTime(session.startAt, user.timezone)}. Your session stays booked until the new time is
        confirmed.
      </p>
      <PickAndConfirm
        professional={professional}
        text={{ pick: 'Choose a new time', confirm: 'Confirm the new time', button: 'Move session', busy: 'Moving…' }}
        previousStartAt={session.startAt}
        onConfirm={move}
      />
    </>
  );
}
