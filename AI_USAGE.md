# AI usage

## Tools

- **Claude Code** (Anthropic's coding agent, running in VS Code) as a pair programmer for the whole
  project.
- No other AI tools.

## How I used it

| Part | What the AI did | What I did |
| --- | --- | --- |
| Planning | Read the brief and proposed a plan: stack, data model, the hard parts, test list, 5-day schedule. | Reviewed the plan, chose the stack, and set the priorities. |
| Backend | Wrote most of the code and tests from the agreed design. | Made the design calls and pushed back where it got complicated (see below). Reviewed the code, ran it, and checked behaviour. |
| Frontend | Proposed a design direction and wrote the React app; took screenshots in a headless browser to review its own UI. | Asked for a calm, readable UI and good UX, and reviewed the screens. |
| Docs | Drafted README, DECISIONS and this file from what we actually built. | Edited them and checked every claim against the code. |

Decisions I made during the work rather than accepting the first proposal:

- **TypeORM** instead of the query builder (Kysely) it started with, because it is what I know and
  can explain in depth. The AI kept the migrations as hand-written SQL because the overlap
  constraints cannot be expressed in TypeORM, which I agreed with.
- **JWT access + refresh tokens** instead of the server-side session cookie it first built. It
  implemented rotation and reuse detection on top of my request.
- **Simpler structure.** Its first layout split each feature across many layer folders. I asked for
  something anyone can read at a glance, and then for one folder per feature with `routes`, `model`
  and `schema` files. I also asked for a header comment in every file.
- **Commit identity and history:** small commits as we went, authored under my GitHub account.

## Where I corrected, rejected or improved what the AI produced

**1. A test that could pass for the wrong reason.**
The first version of the "10 members book the same slot at once" test passed straight away. A
concurrency test that passes first time does not prove much: requests might simply not have run in
parallel. We temporarily removed the database exclusion constraint and re-ran it: the test failed
(two bookings succeeded), and passed again once the constraint was back. Now I know the test
really checks the guarantee and not the timing of the test runner.

**2. Daylight saving: the library default was not the behaviour I wanted.**
When clocks go back, a local time like 01:30 happens twice. Luxon silently picks the *second*
occurrence. Rather than inherit that, we chose the first occurrence (the moment a wall clock first
shows that time) and skip times that do not exist when clocks jump forward, and pinned both with
tests for New York and London. We checked the library's actual behaviour with a small script before
writing the slot code, instead of assuming it.

**3. A bulk refactor that broke the code.**
When restructuring into feature folders, the AI rewrote every import path with a script. The script
had an off-by-three bug and produced paths like `./auth/auth.rou.js`. The type checker caught it
immediately. A second path-based repair also failed on short names (`app`, `db`). The final fix
rebuilt every import from the names each file actually exports, and the type check plus all 94 tests
confirmed nothing changed in behaviour. Lesson: mechanical refactors are only done when the compiler
and the tests say so.

**4. A wrong commit, caught before pushing.**
A `git add` failed on a path that no longer existed, but the commit still ran and contained only some
deletions. Checking `git show --stat` showed it; it was undone with a soft reset (nothing lost) and
redone. Nothing had been pushed.

**5. Simplicity over cleverness.**
I rejected several versions as harder to read than necessary: long query-builder chains became plain
`find` calls, a callback-based token rotation became a function that returns the new tokens or
`null`, and response fields the UI could work out itself were removed.

**6. UI details found by looking, not assuming.**
Reviewing screenshots showed that the first body font draws every zero with a slash ("16:ØØ"), which
is noisy on a screen full of times; an unlabelled number on each calendar day; and the old
"Asia/Calcutta" name coming from the browser. All three were fixed: a different font, the count moved
next to the day heading, and a grouped timezone picker that shows the current time in the chosen
zone.

## What I take responsibility for

I can explain every part of this code: why the overlap rule lives in the database, how a reminder
is delivered exactly once, how slots are laid out across daylight saving changes, and the security
trade-offs in the token handling. Where the AI wrote code I did not want, I changed the approach;
where it was right, I kept it and checked it with tests.
