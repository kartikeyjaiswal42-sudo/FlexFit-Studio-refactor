# Testing

## The rule the UI suites are built on

**A toast is never evidence.** A success message proves that a handler ran, not that anything
was written. Every UI suite here reads the database, presses the real control in a real browser,
reads the database again, and compares.

`scripts/test-buttons-ui.mjs` also runs an **offline-honesty** section: it aborts every
`/api/trpc` request and asserts the app refuses rather than showing green over nothing. An app
that lies when its backend is missing is worse than one that is obviously broken.

## What runs, and where it is safe to run it

| Command | Checks | Needs | Safe against production |
| --- | --- | --- | --- |
| `pnpm verify:numbers` | 85 | nothing — no browser, no database | n/a (pure) |
| `pnpm smoke` | 14 | a URL | **yes** — read-only |
| `pnpm test:live` | 29 | a URL, a browser | **yes** — read-only |
| `pnpm test:api` | 61 | local D1 | **no — mutates** |
| `pnpm test:buttons` | 31 | local D1, a browser | **no — mutates** |
| `pnpm test:fixes` | 53 | local D1, a browser | **no — mutates** |
| `pnpm test:ui` | 38 | local D1, a browser | **no — writes one payment row** |
| `pnpm test:new-member` | 12 | local D1, a browser | **no — creates a member, takes a payment** |
| `pnpm test:signin-roles` | 20 | a browser | yes |
| `pnpm test:front-door` | 12 | a browser | yes |

`test:new-member` refuses to run against an `https` base at all, rather than trusting whoever
typed the command.

## Why some of them have to mutate

`test:api` issues **real refunds** and records **real check-ins**. That is not laziness; it is
the only honest way to test an append-only ledger. You cannot verify that a refund adds a row
rather than editing one without adding a row.

The consequence is that a given database survives roughly one run. Pointed at production it
scored **49 of 54**, and all five failures were the suite tripping over its own previous run:
*"a settled payment can be refunded — this payment has already been refunded"*, *"the refund
added a row rather than editing one — 66 → 66"*, *"a repeat tap does not move the heatmap again
— expected 37412, got 37411"*.

As a deploy gate that suite would go red on the second deploy and every deploy after it,
reporting a fault that does not exist, while writing test rows into live data. So the pipeline
runs `smoke.mjs` instead — read-only, and re-asserting on every deploy the invariant most likely
to break silently: the materialised heatmap must still agree with the check-in table it
summarises.

## `verify:numbers` is the unusual one

85 checks, no browser and no database. Every assertion re-derives its value **a second time from
the raw entities by a different route** and demands the two agree, because a check that calls the
app's own function and compares the result to itself passes no matter what the function does.

It exists because a KPI tile, a report row and a detail page can each be individually correct and
still disagree — which is exactly what it found on its first run. See
[03-failures.md](03-failures.md) §3.

## Testing gotchas, all hit for real

**`innerText` applies CSS `text-transform`.** An uppercase table header returns `"S.NO"` and
`"BOOK VALUE"` while the source says `"S.no"` and `"Book value"`, so a case-sensitive
`includes()` reports a missing column that is on screen. Cost a round of false failures.

**A Playwright click can land before React hydrates, and Playwright is perfectly happy.** The
control is visible, enabled and stable; the click does nothing. It surfaces later as a navigation
timeout, and against a cold Worker that window is hit every time. Wait for state that only
appears after React has handled something — `aria-pressed` flipping, `aria-checked` flipping —
rather than for the element.

**`documentElement.scrollWidth` false-positives in this `h-dvh` shell.** It reported 562 on a page
that could not be panned at all, because it counts unclipped descendants. The honest check is
whether `window.scrollX` moves. `fullPage` screenshots mislead for the same reason — content
scrolls inside `main`, so scroll `main.scrollTop` and capture the viewport.

**Reading a dialog's text the instant it mounts catches it before the template is applied.** The
retention compose box false-failed as "empty" on a dialog holding 279 characters. Assert on field
*values*, and wait for them.

**A bare `button[aria-pressed]` selector on `/schedule` also matches the Week/Day toggle.** Scope
overlap checks to `[class*="absolute"] > button[aria-pressed]`, or a toolbar passes the test for
you.

**Role was a non-persisted `useState`**, so a full `page.goto` reset it and role gating had to be
tested through client-side navigation. It is now written to `flexfit_role`, the same key sign-in
writes, which is both more testable and more honest.

## What is not covered

Listed in [07-limits.md](07-limits.md). The short version: there is no authentication to test,
email delivery is unproven end-to-end until a Resend key exists, and no suite exercises the SMS
or push channels because they are not connected — they are labelled *(not connected)* in the UI
rather than faked.
