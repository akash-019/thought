# AI usage

I used Claude Code (Anthropic's coding assistant) inside VS Code for this whole assignment. I didn't
use any other AI tools.

## What I used it for

I started by giving it the brief and asking for a plan before any code: the stack, the data model,
which parts are actually hard here, and what needs tests. I went through that plan and picked the
stack myself. After that it wrote most of the code and the tests, and I steered it: I made the design
calls, reviewed what it produced, ran things, and asked for changes when I didn't like the result.
It also drafted the README and DECISIONS, which I then went through and edited.

A few things I changed from what it first suggested:

- It started with Kysely (a query builder). I switched to TypeORM because that's what I'm used to and
  can explain properly. The migrations stayed as plain SQL, since the overlap constraints can't be
  written in TypeORM anyway.
- It first built login with a server-side session cookie. I wanted JWT with access and refresh
  tokens, so we changed it. Rotation and reuse detection came out of that.
- The first folder structure spread every feature across lots of layer folders (routes, services,
  domain, lib...). I found it hard to follow, so I asked for one folder per feature with `routes`,
  `model` and `schema` files, plus a short comment at the top of every file saying what it's for.
  I also kept pushing for simpler code in general, like plain `find` calls instead of long query
  builder chains.

## Things I had to correct

**The race-condition test passed too easily.** The test where 10 members try to book the same slot at
the same time passed on the first run. That made me suspicious, because a concurrency test passing
straight away doesn't tell you much. So I removed the database constraint and ran it again. It
failed, with two bookings going through. With the constraint back it passed. That's the check that
the test actually tests the rule and not just luck with timing.

**Daylight saving.** When clocks go back, a time like 01:30 happens twice that night. Luxon quietly
picks the second one. I didn't want to inherit that by accident, so we checked what the library does
with a quick script first, then decided on the first occurrence and wrote tests for it (New York
and London). Times that don't exist when clocks go forward are simply not offered.

**A refactor that broke every import.** When moving files into feature folders, the AI rewrote the
import paths with a script, and the script cut three characters off each path (`auth.rou.js`). The
type check caught it straight away. Its second attempt failed too, on short file names like `app`.
What finally worked was rebuilding each import from what each file actually exports. I only treated
it as done once the type check and all the tests passed again.

**A flaky end-to-end test.** The test where two members book the same time from two browsers
failed 2 times out of 5. The screenshots showed the app was right every time: one member got the
session, the other got "Sorry, this time was just booked" and fresh times. The bug was in the test:
it sorted the list of results in place and then used that list to find the losing browser, so it
sometimes looked at the wrong one. After the fix it passed 10 out of 10. I also switched the
reminder worker off once to make sure the reminder test fails without it, so I know it isn't
passing by accident.

**A bad commit.** At one point a `git add` failed but the commit still went through with only a
couple of deleted files in it. I saw it in `git show --stat`, undid it with a soft reset and redid it
properly. It was never pushed.

**UI details.** I asked it to take screenshots of every page so I could actually look at them. That
showed some things I wouldn't have spotted in the code: the font drew zeros with a slash, which looks
messy on a screen full of times; there was a small unlabelled number on each calendar day; and
Chrome was giving the old "Asia/Calcutta" timezone name. All three got fixed.

## In short

The AI saved me a lot of typing, but the decisions are mine and I've gone through the code. I can
explain why the overlap rule lives in the database, how a reminder gets delivered exactly once, how
slots are worked out across daylight saving changes, and the trade-offs in how tokens are stored.
