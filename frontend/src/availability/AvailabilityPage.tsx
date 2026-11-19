/**
 * File: src/availability/AvailabilityPage.tsx
 *
 * Professionals: their availability, in two parts: weekly working hours and days off.
 * Times are in the professional's own timezone. Saving never changes sessions already booked.
 */
import { useUser } from '../auth/AuthContext';
import { cityOf } from '../lib/time';
import { usePageTitle } from '../lib/usePageTitle';
import { DaysOff } from './DaysOff';
import { WeeklyHours } from './WeeklyHours';

export function AvailabilityPage() {
  const user = useUser();
  usePageTitle('Availability');
  return (
    <>
      <h1>Availability</h1>
      <p className="lead">
        Times are in your timezone ({cityOf(user.timezone)}). Members see them in theirs. Changes never affect sessions
        that are already booked.
      </p>
      <WeeklyHours />
      <DaysOff />
    </>
  );
}
