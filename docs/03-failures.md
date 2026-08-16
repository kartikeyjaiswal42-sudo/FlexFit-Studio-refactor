# Failures

Five defects that reached working code, in descending order of how quietly they behaved. None
of them threw an error. Three of them were on the deployed site.

---

## 1. A check-in destroyed a member's lifetime value, and nothing reported it

**Symptom.** None. That is the point.

**What was wrong.** `recomputeMemberMetrics` set a member's lifetime value to the sum of their
rows in `payments`. But `payments` is **one billing cycle** — 65 rows covering 54 of 380
members — not a payment history. The seeded lifetime values are modelled multi-year figures.

So any recompute replaced a member's real figure with a single-cycle sum, or, for the 326
members with no row in the current cycle, with **zero**. A kiosk check-in was enough to trigger
one.

**What it did.** The top member in the dataset drops from **₹4,32,378 to ₹0**. They lose the
`vip` tag, because that is `lifetimeValue >= 90000`. They sink to the bottom of a value-sorted
directory. No request failed, no console error, no toast. The number is simply wrong from then
on, and it looks like a number.

**Fix.** `migrations/0004_lifetime_base.sql` adds `metric_lifetime_base`. Lifetime value is
defined as base + ledger, backfilled as `current − ledger sum` and floored at 0, so from then on
a payment moves the figure by exactly the payment.

**The backfill moves two members, and that is correct rather than drift.** Book-wide the total
rises ₹11,417 (23,566,676 → 23,578,093), all of it from two members of 380. A member whose ledger
records *more* than their stored value would need a **negative** base to preserve the old figure —
which would be an assertion that the ledger over-counts money it actually took. Their value rises
to what was really recorded. The other 378 are unchanged to the rupee, and nobody falls.

**The first test for this passed against the broken code.** It picked "any active member" — and
for a member whose entire history sits inside the current cycle, both the old formula and the new
one agree. It now picks a member with history and no ledger rows, and separately asserts that
such a member exists, so the test cannot silently stop testing anything. The seven checks assert
*deltas*, not absolutes; reverting the fix reddens three of them.

**Why the seed does not carry the column.** Regenerating it churned 38,000 lines and reordered
`check_ins`, and it would fail against the base schema. So the order is `db:local` → `seed:local`
→ … → `db:local:ltv`, and that order is written down in the README rather than remembered.

---

## 2. A duplicate check-in was blocked, and counted anyway

**What was wrong.** A kiosk double-tap was correctly prevented from inserting a second row —
deterministic id plus `onConflictDoNothing`. But `bumpAttendanceAggregates` ran
**unconditionally**. The row was rejected; the materialised heatmap incremented.

So the aggregate drifted away from the table it summarises, silently, one tap at a time. Since
the heatmap exists precisely so nobody has to scan `check_ins`, nothing would ever have compared
them.

**Fix.** `.returning({ id })` on the insert, and the aggregate is bumped only when a row was
really inserted. The procedure returns `duplicate: true` rather than erroring, because a second
kiosk tap means the same thing as the first.

**The test suite passed while the bug was live, and it is worth understanding why.** The
assertion was written as `heatBefore + 2` — which is what the broken code produced. It was named
*"does not double-count"*. **The name described the intent and the assertion encoded the bug.**

A permanent check now compares the heatmap total against `COUNT(*)`, and it runs in `smoke.mjs`
on every deploy — the one suite that is safe against production.

---

## 3. Two numbers on the same screen were 75% apart

**Symptom.** Visible for days, on the dashboard, to anyone who looked at both halves of the same
card: *Visits · 30 days* read **4,721** above a heatmap built from **2,703** rows.

**What was wrong.** `dailyAttendance` and `checkIns` were two unrelated generators. Each was
individually reasonable. Nothing had ever compared them, because nothing existed whose job was
to compare things.

**Fix.** Daily totals count the events over the 364 days the two sources share; the older tail
stays modelled and is scaled to meet the seam. `migrations/0002_attendance_reconcile.sql` repairs
the data already in D1 exactly, rather than re-seeding — step order matters, and it was proved
idempotent over three runs before production.

**What actually fixed it** was writing `verify:numbers` (see
[02-protecting-behaviour.md](02-protecting-behaviour.md) §4), which found this on its first run.
The defect is not interesting. The absence of anything that could have found it was.

---

## 4. Every control on `/settings` was dead, and only when React deferred

**What was wrong.** `e.currentTarget.value` read **inside** a `setDraft(d => …)` updater. React
nulls `currentTarget` once the handler returns, so the updater — which React may run later —
threw *"Cannot read properties of null (reading 'value')"*, and the whole screen died.

**Why a hand test missed it.** It only reproduces when React defers the update. Typing slowly,
by hand, in development, it works.

**What caught it.** `scripts/test-buttons-ui.mjs`, on its first run. The same suite reported two
further "bugs" that were its own selector mistakes, and both are worth knowing because they are
indistinguishable from product defects:

- `locator('button, a', { hasText: /^Billing/ })` matched the **sidebar nav link** before the
  billing tab. Scope tab clicks to `[role="tab"]`.
- Clicking a submit button before the store reaches `live` hits a correctly-disabled control, and
  Playwright reports *"waiting for locator"* — which reads exactly like "the button does not
  exist". Hence `pressWhenReady`.

---

## 5. A screen that hid data by design

**What was wrong.** `DayColumn` cascaded three or more concurrent class blocks on top of each
other to keep each one readable. Measured: **18 overlapping pairs in a single week.** Classes
were invisible, and the layout was doing it deliberately.

**Fix, and the three follow-ons that were required or it just trades problems.** Blocks tile.
Narrow blocks drop the capacity bar, the trainer and the am/pm — the hour gutter already says
which half of the day it is. **Each day column is sized for its own busiest hour, not the week's**,
because one shared `maxLanes` widened all seven columns until Sunday fell off a 1440px screen. And
the empty "pick a class" rail (360–400px of nothing) renders only once a class is actually selected.

---

## What these have in common

Four of the five produced no error, no failed request and no visible break. They produced *wrong
numbers that looked like numbers*, or *absent things that looked like empty*.

That is the argument for the shape of the test suite in [04-testing.md](04-testing.md): assertions
that re-derive a value by a second route, checks that read the database on both sides of a button
press, and invariants that run on every deploy. A suite built around "does the page load" would
have caught none of them — and in the case of the double-count, a suite that *did* exist passed
happily while encoding the bug in its own assertion.
