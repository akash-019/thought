# Decisions

Key technical decisions, the assumptions behind them, known limitations, and what I would do next.
The sections the brief asks for directly are: [preventing double-booking](#preventing-double-booking),
[reminders](#reminders-scheduled-and-delivered-exactly-once),
[timezones and daylight saving](#timezones-and-daylight-saving), and
[running this safely in production for a healthcare product](#running-this-safely-in-production-for-a-healthcare-product).

## Stack

| Choice | Why |
| --- | --- |
| TypeScript end to end (Express 5, React 19) | One language for both sides; types shared in spirit between API and UI. |
| Postgres 16 | Exclusion constraints, `FOR UPDATE SKIP LOCKED`, and real transactions are exactly what booking and reminders need. |
| TypeORM, entities as `EntitySchema` | A familiar ORM for everyday queries. `EntitySchema` instead of decorators because the test runner and `tsx` cannot emit the decorator metadata TypeORM relies on, which can silently lose column types. |
| Hand-written SQL migrations | The most important rules (overlap constraints) are Postgres features an ORM cannot describe. They live in `backend/src/db/migrations` where they can be read. |
| Luxon | Correct IANA timezone and daylight saving handling. |
| zod | Request validation in one `*.schema.ts` per feature. |
| Vitest + real Postgres | Concurrency and constraint behaviour cannot be tested against mocks. |

## Assumptions

- **Slot layout.** Slots start every 60 minutes from the start of each working range: a 50-minute
  session plus a 10-minute break for the professional to write notes and reset. The last slot must
  finish by the end of the range. Monday 09:00–12:30 gives 09:00, 10:00 and 11:00. Hourly starts
  are also easy to read in a calendar.
- **Working hours** are one or more ranges per weekday (so a lunch break is possible). Ranges on the
  same day may not overlap, and overnight ranges (22:00–02:00) are not supported; `24:00` is allowed
  as an end time.
- **The 4-week window** is "now to now + 28 days".
- **"24 hours before"** means 24 hours of real elapsed time, for both the change rule and the
  reminders. Exactly 24:00:00 before the start still allows a change; 23:59:59 does not.
- **Rescheduling** moves a session to another slot with the same professional. A member who wants a
  different professional cancels and books again.
- **Professionals can cancel but not reschedule** (the brief only gives them cancel). They can cancel
  until the session ends.
- **Changing working hours never touches booked sessions.** Only future free slots change.
- **A user's timezone is fixed after sign-up.** Changing it would be easy for members (everything is
  stored in UTC) but would silently move a professional's working hours, so it needs a product
  decision first.
- **Notifications** are also created when a session is booked (for the professional), cancelled (for
  the other person) or rescheduled (for the professional). In a support context, silently losing a
  session is the worst outcome.
- **Minimum booking notice** (optional extra) is 2 hours, configurable with `MIN_NOTICE_MINUTES`.

## Preventing double-booking

The guarantee lives in the database, not in application code
(`backend/src/db/migrations/003_sessions.ts`):

```sql
CONSTRAINT sessions_no_professional_overlap
  EXCLUDE USING gist (professional_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&)
  WHERE (status = 'booked'),
CONSTRAINT sessions_no_member_overlap
  EXCLUDE USING gist (member_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&)
  WHERE (status = 'booked')
```

- Postgres refuses any booked session that overlaps another booked session of the same professional,
  or of the same member (so a member cannot hold overlapping sessions with two professionals).
- The check is atomic. When two members book the same slot at the same moment, one insert succeeds
  and the other fails with error `23P01`, which the API turns into
  `409 SLOT_TAKEN: "Sorry, this time was just booked. Please pick another slot."` The UI then shows
  fresh times.
- The application deliberately does **not** "check, then insert": that pattern has a race window.
  It only validates what the database cannot know: that the time is a real slot of the professional
  (on the hourly grid, inside working hours, not a blocked day) and not in the past.
- Cancelled and rescheduled sessions drop out of the constraint (`WHERE status = 'booked'`), so their
  time becomes bookable again.
- `'[)'` ranges mean back-to-back sessions (10:00–10:50 and 10:50–11:40) do not count as overlapping.

**Tested** in `booking.test.ts`: 10 members request the same slot in parallel and exactly one gets
`201`; a member double-clicking gets one session; overlapping sessions with two professionals are
refused; and a raw SQL insert that overlaps is rejected by the database itself. To make sure the race
test really tests the constraint, I removed the constraint once and confirmed the test fails.

## Cancel, reschedule and the 24-hour rule

- Every change runs in one transaction that first locks the session row (`SELECT … FOR UPDATE`), so
  two changes to the same session cannot interleave.
- **Reschedule** marks the old session `rescheduled`, cancels its reminders and books the new slot,
  all in that one transaction. If the new slot is taken or invalid, everything rolls back and the
  original session stays booked with its reminders. The member always ends with exactly one session.
  Freeing the old slot first also lets a member move to a slot that overlaps their current one.
- Within 24 hours, members get `403 WITHIN_24H` with a readable message. The UI does not even show
  the buttons then; it says why and suggests contacting the professional.

## Reminders, scheduled and delivered exactly once

**Scheduling.** When a session is booked, the reminders are inserted in the same transaction as the
session: 24 hours and 1 hour before, for both the member and the professional. A reminder whose time
has already passed is not created (booking 3 hours ahead creates only the two 1-hour reminders).
Cancelling or rescheduling marks pending reminders `cancelled` in the same transaction as the change.

**Delivery.** A separate worker process (`backend/src/worker.ts`) polls every 10 seconds:

```sql
SELECT … FROM reminders r JOIN sessions s ON s.id = r.session_id
 WHERE r.status = 'pending' AND r.fire_at <= now
 ORDER BY r.fire_at LIMIT 500
 FOR UPDATE OF r SKIP LOCKED
```

For each row, in the same transaction, it inserts the in-app notification and sets the reminder to
`delivered`. Exactly-once comes from:

1. **No in-memory state.** Reminders are database rows, so a restart loses nothing. A worker that
   was down simply finds the overdue rows on its next poll.
2. **One transaction per batch.** The notification and the status change commit together or not at
   all: a crash can never deliver without marking, or mark without delivering.
3. **`SKIP LOCKED`.** Several workers can run at once; none ever picks a row another one holds.
4. **`notifications.reminder_id` is UNIQUE.** Even a bug cannot create a second notification for the
   same reminder.

If the worker comes back after a session has already started, that session's reminders are marked
`expired` instead of sending a misleading "starts in 1 hour".

**Tested** in `reminders.test.ts`: delivery at the right moment, repeated runs deliver nothing new,
four workers in parallel produce no duplicates, catch-up after downtime, expiry, and cancellation.

**Trade-off:** polling means a reminder can arrive up to about 10 seconds late, and the database is
queried every 10 seconds. That is fine at this scale; see "next steps" for a queue.

## Timezones and daylight saving

- **Storage:** every instant is `timestamptz` (UTC). Each user has an IANA timezone
  (`Asia/Kolkata`, not an offset like `+05:30`, because offsets change with daylight saving).
- **Working hours** are stored as wall-clock times (`09:00`) plus the professional's timezone. Slots
  are generated per calendar date on the professional's local clock and only then converted to UTC
  (`backend/src/modules/availability/slots.ts`). So a 09:00 start in New York is 14:00 UTC in winter
  and 13:00 UTC in summer, which is what the professional expects.
- **Daylight saving edge cases:**
  - *Clocks jump forward* (02:30 does not exist on that day): no slot is offered at a non-existent
    time.
  - *Clocks go back* (01:30 happens twice): the slot uses the first occurrence. Luxon picks the
    second one by default; I chose the first so the slot is at the moment a wall clock first shows
    that time, and covered it with a test.
  - On those days a range's real length differs from its clock length; a slot is only offered if it
    really fits before the end of the range.
- **Display:** the API returns UTC. The calendar groups slots by date **in the member's timezone**
  (so a Monday-morning slot in Kolkata appears on Sunday evening for a member in Los Angeles), and the
  UI shows each slot in both the member's and the professional's time. All times use the timezone
  saved on the account, not the browser's.
- **The 24-hour rule and reminders** use elapsed time, so a daylight saving change in between does
  not stretch or shrink them.
- **Tested** with New York (spring forward and fall back), London, Kolkata (half-hour offset) and
  Auckland (window edges on a different local date).

## Authentication

- **Access token:** a JWT (HS256) valid for 15 minutes, sent as `Authorization: Bearer …`. The
  backend verifies it on every request and loads the user; the acting user never comes from a body,
  query or URL parameter.
- **Refresh token:** a random 256-bit string valid for 7 days, stored only as a SHA-256 hash. Each
  `POST /auth/refresh` revokes it and issues a new pair (rotation). Presenting an already-used
  refresh token again revokes all of that user's refresh tokens, because it suggests it was copied.
- **Logout** revokes the refresh token. The access token remains valid for at most 15 minutes; that
  is the standard trade-off for stateless access tokens.
- **Passwords** are hashed with scrypt (Node built-in, per-user salt). Login gives the same error
  and similar timing whether or not the email exists.
- **Trade-off:** the frontend keeps tokens in `localStorage` so a reload keeps you logged in. That
  is readable by any script on the page, so it depends on the app having no XSS. An httpOnly cookie
  for the refresh token would be safer; see the production section.

## Access control and privacy

- Every query is filtered by the caller's own id. Asking for someone else's session returns `404`,
  not `403`, so the response does not even confirm it exists.
- Role checks: only members book and reschedule; only professionals edit availability.
- A member viewing a calendar receives only free start times. Professionals see a member's name, not
  their email. The professional list exposes name, bio and timezone only.
- Tested in `access.test.ts`.

## Other trade-offs

- **Routes hold the request handling;** real logic sits in small helper files next to them. I chose
  this over separate controller and service layers to keep each feature in a few readable files.
- **Polling the notification list** every 30 seconds in the UI instead of WebSockets or server-sent
  events: simple and enough for reminders measured in hours.
- **Slots are computed on request** from the weekly rules rather than stored. 4 weeks for one
  professional is a few hundred slots, which is cheap; it also means changing hours takes effect
  immediately.

## Known limitations

- Reminders are in-app only (as the brief asks). A member who never opens the app misses them.
- Timezone cannot be changed after sign-up (see assumptions).
- No overnight working ranges (a professional working 22:00–02:00 enters two ranges on two days).
- In the rare fall-back hour the second occurrence of a repeated time is never offered.
- The frontend has no automated tests; its logic is thin and the rules it shows are enforced and
  tested on the backend.
- Rate limiting, account lockout and audit logging are not implemented.

## What I would do next

1. Email and SMS reminders through a provider, sent by the same worker using the same exactly-once
   pattern (with an idempotency key per reminder at the provider).
2. A proper job queue (for example Postgres-backed pg-boss, or SQS) with retries and a dead-letter
   queue if reminder volume grows; alerting when reminders are overdue.
3. Refresh token in an httpOnly, SameSite cookie instead of `localStorage`.
4. Let professionals reschedule (with the member's agreement) and add a waitlist for full days.
5. Frontend tests for the booking flow (Playwright) and a CI pipeline running both suites.
6. Allow changing timezone, with a clear choice for professionals about what happens to their hours.

## Running this safely in production for a healthcare product

- **Regulation and data:** identify the regimes for each market (for example PDPA in Singapore,
  GDPR in Europe, HIPAA where US health data is involved), keep data in the right region, sign data
  processing agreements, and define retention and deletion. Session existence alone can be sensitive
  health information.
- **Security:** TLS everywhere; encryption at rest and in backups; secrets in a manager rather than
  environment files; MFA for professionals and staff; rate limiting and lockout on login; the refresh
  token in an httpOnly cookie with CSRF protection; a strict Content Security Policy; dependency and
  container scanning; regular penetration tests.
- **Auditability:** an append-only audit log of who viewed or changed which session and when, and
  least-privilege access for staff and support tooling.
- **Reliability:** managed Postgres with point-in-time recovery and tested restores; several API and
  worker instances (the design already allows it); health checks; monitoring and alerts on error
  rates and on reminders that are overdue or expired; runbooks.
- **Communication:** reminders over more than one channel (in-app, email, SMS, push) with user
  preferences and consent, delivery tracking, and no sensitive details in message text.
- **Clinical safety:** a clear path when a professional cancels at short notice (offer another
  professional quickly), crisis-support information in the app, and a way for support staff to
  contact a member whose session fell through.
- **Process:** code review and CI gates, staged rollouts, and an incident response plan.
