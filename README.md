# Thought

Session booking with reminders.

**Live demo:** https://thought-9hk8.onrender.com/login

> This is a Render app (free plan), so the first time it may take about a minute to load.
> Log in with any [demo account](#quick-start); the password is `password123`.

Thought is a small, working version of a booking flow for a mental-health platform. Members find a
professional, pick a time from a 4-week calendar shown in their own timezone, confirm, and book a
50-minute session. Both people get in-app reminders 24 hours and 1 hour before it starts.

The parts that make this harder than it looks are handled in the database and tested directly:
no double-booking even under concurrent requests, timezones and daylight saving changes, the
24-hour change rule, and reminders delivered exactly once across restarts.
See [DECISIONS.md](DECISIONS.md) for how and why, and [AI_USAGE.md](AI_USAGE.md) for how AI was used.

| Booking calendar (member in Singapore, professional in Kolkata) | Confirmation |
| --- | --- |
| ![Calendar](docs/screenshots/member-time-selected.png) | ![Confirm](docs/screenshots/member-confirm.png) |
| **My sessions** (inside 24 hours, changes are locked with a clear reason) | **Availability** (each range previews the session times it creates) |
| ![My sessions](docs/screenshots/member-sessions.png) | ![Availability](docs/screenshots/professional-availability.png) |

More in [docs/screenshots](docs/screenshots/): sign-up, notifications, the professional's schedule, mobile.

## Quick start

**Prerequisite:** Docker with Compose v2.

```bash
docker compose up --build
```

| What | Where |
| --- | --- |
| The app | http://localhost:3000 |
| API documentation (Swagger UI) | http://localhost:3000/api/docs |

The first start creates fictional demo accounts. The password for all of them is `password123`.

| Email | Role | Timezone | Good for trying |
| --- | --- | --- | --- |
| `sam@example.com` | Member | Singapore | One session inside 24 hours (locked), one that can be changed |
| `priya@example.com` | Member | Los Angeles | Booking across a large time difference |
| `maya@example.com` | Professional | London | Schedule with member names, availability editor |
| `arjun@example.com` | Professional | Kolkata (UTC+5:30) | Half-hour offset |
| `sofia@example.com` | Professional | New York | Daylight saving time zone |

You can also sign up as a new member or professional.

## Running the tests

There are three test suites, from fastest to most complete.

**Backend: 117 tests** against a real Postgres database (a separate `booking_test` database):

```bash
docker compose run --rm test
```

- **Unit tests** (`backend/test/unit`): slot generation, timezones and daylight saving changes,
  the 24-hour rule, reminder planning, password hashing.
- **Integration tests** (`backend/test/integration`): the API end to end, including 10 members
  booking the same slot at once (exactly one wins), concurrent reschedules, reminder delivery with
  parallel workers and after downtime, refresh-token rotation, rate limits, and an access-control
  matrix that calls every endpoint as five different kinds of user.

Without Docker for the tests themselves: start only the database with `docker compose up -d db`,
then `cd backend && npm install && npm test`.

**Frontend: 37 tests**, no backend needed (a few seconds):

```bash
cd frontend && npm install && npm test
```

Time and timezone formatting (including when the two people are on different dates), the booking
calendar, the pick-then-confirm flow and its "time just taken" recovery, the 24-hour lock and
cancel confirmation on session rows, and the API client's token refresh.

**End to end: 13 browser tests** (Playwright) against the running app:

```bash
docker compose up --build -d          # the app on http://localhost:3000
cd e2e && npm install && npx playwright install chromium
npm test
```

Sign-up and log-in, the full booking journey (book, reschedule, cancel), two members booking the
same time from two browsers at once, the 24-hour rule in the browser and the API, reminders
delivered by the running worker, the professional's availability, and staying logged in when the
access token expires. Set `BASE_URL` to test another deployment.

## Local development

```bash
docker compose up -d db                      # Postgres on localhost:5433

cd backend
npm install
npm run seed                                 # optional: demo accounts
npm run dev                                  # API on http://localhost:4000
npm run dev:worker                           # reminder worker (second terminal)

cd ../frontend
npm install
npm run dev                                  # app on http://localhost:5173 (forwards /api to :4000)
```

Settings are environment variables with local defaults. [backend/.env.example](backend/.env.example)
lists every one with a short explanation.

## Deploying to Render

Live: https://thought-9hk8.onrender.com/login

**Render (free):** in Render choose **New → Blueprint** and pick this repository.
[render.yaml](render.yaml) creates one web service from the same [Dockerfile](Dockerfile) used
locally. Render gives it no `DATABASE_URL`, so [start.sh](start.sh) starts a Postgres inside the
container first; the container then runs everything: the API, the web app, the reminder worker and
the database. `JWT_SECRET` is
generated by Render, and the demo accounts are created on start.

> Render's free plan has no persistent disk. Data lasts until the instance restarts or redeploys
> (for example after 15 minutes without visitors), and then the demo accounts are re-seeded. For
> durable data, attach a disk at `/data` (paid plan; already prepared in render.yaml) or run
> Postgres as its own service, as docker-compose.yml does locally.

## Architecture

```mermaid
flowchart LR
  browser([Browser]) -->|pages + /api| app[app<br/>Express API + React build<br/>+ reminder worker]
  app --> db[(Postgres)]
```

Two containers in docker-compose.yml, both from one [Dockerfile](Dockerfile) and the Postgres image:

- **app**: Express 5 + TypeScript. It serves the React app (Vite build) and the API on one origin,
  validates input with zod, identifies the caller from a JWT access token on every request, and
  runs every change in a database transaction. It also runs the reminder worker, which polls for
  due reminders every 10 seconds and turns each into an in-app notification exactly once (the
  worker can also run as its own process: `node dist/worker.js`).
- **db**: Postgres 16 with a volume, so data survives restarts and redeploys. It also enforces the
  rules that must never break, such as "no two booked sessions overlap for the same professional
  or the same member" (exclusion constraints).

All times are stored in UTC. Working hours are stored as local wall-clock times in the
professional's timezone and turned into exact times per date, which is what keeps "Monday 09:00"
at 09:00 local across daylight saving changes.

### Folder structure

```
thought/
├── README.md  DECISIONS.md  AI_USAGE.md
├── backend/
│   ├── src/
│   │   ├── app.ts  server.ts  worker.ts  config.ts
│   │   ├── modules/                 one folder per feature
│   │   │   ├── auth/                sign up, log in, tokens, who is calling
│   │   │   ├── availability/        weekly hours, days off, slot generation
│   │   │   ├── professionals/       list, profile, free slots
│   │   │   ├── sessions/            book, cancel, reschedule (+ the 24-hour rule)
│   │   │   └── notifications/       reminders and the in-app notification list
│   │   ├── common/                  errors, clock, timezones, shared validation
│   │   └── db/                      connection, migrations, demo seed
│   ├── test/unit  test/integration
│   └── openapi.yaml                 API documentation
├── frontend/
│   └── src/
│       ├── api/                     the one fetch wrapper (+ token refresh) and API types
│       ├── auth/  professionals/  sessions/  availability/  notifications/
│       ├── components/  lib/  styles.css
│       └── **/*.test.ts(x)          frontend unit and component tests
├── e2e/                             browser end-to-end tests (Playwright)
├── docs/screenshots/
├── docker-compose.yml               everything locally with one command (db + app + test)
├── Dockerfile                       one image: API + web app + reminder worker (local and Render)
├── start.sh                         starts the app in that image (and Postgres, on Render)
└── render.yaml                      Render Blueprint
```

Each feature folder holds its `*.routes.ts` (the endpoints), `*.schema.ts` (request validation),
and one `*.model.ts` per table, with any real logic in a plainly named file next to them
(for example `availability/slots.ts`, `sessions/booking.ts`). Every file starts with a short
comment saying what it contains and what it is for.

## How the brief maps to the code

| Requirement | Where | Tested in |
| --- | --- | --- |
| Sign up, log in, log out; user from token, never from client ids | `modules/auth` | `auth.test.ts`, `access.test.ts` |
| Weekly working hours in the professional's timezone | `modules/availability` | `availability.test.ts`, `weekly-hours.test.ts` |
| Slot generation and layout | `availability/slots.ts` | `slots.test.ts` |
| Calendar for 4 weeks in the member's timezone | `professionals.routes.ts`, `SlotPicker.tsx` | `booking.test.ts`, `slots.test.ts` |
| No double-booking, no overlapping sessions, no past slots | migration `003_sessions.ts`, `sessions/booking.ts` | `booking.test.ts` |
| My sessions / professional's schedule with member names | `sessions.routes.ts` | `booking.test.ts`, `access.test.ts` |
| Cancel and reschedule, 24-hour rule, never zero or two sessions | `sessions/booking.ts` | `changes.test.ts`, `rules-and-reminders.test.ts` |
| Reminders 24h and 1h before, exactly once, survive restarts | `notifications/reminders.ts`, `worker.ts` | `reminders.test.ts` |
| Persistence | Postgres + migrations | all integration tests |
| Access control and privacy | every query scoped to the caller | `access.test.ts`, `access-matrix.test.ts` |
| Security: log-in brute-force limit, sign-up limit, security headers, no data leaks | `modules/auth`, `app.ts` | `auth.test.ts` |
| Extras: days off, minimum notice (2 hours), one `docker compose up`, deployed demo (Render) | `render.yaml` | `booking.test.ts` |
