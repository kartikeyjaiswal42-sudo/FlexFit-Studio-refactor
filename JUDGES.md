# Evaluating this in fifteen minutes

**Live:** https://flexfit-studio.amitynoidalibrary.workers.dev

This project inherited a 23-screen gym-operations front end that had **no backend of any
kind** — every screen computed its numbers at module load from seeded constants — and put a
real database underneath it without changing what any of those screens said.

That sentence contains the whole difficulty. The seeded app was not a mockup with placeholder
values; it was a coherent simulated gym with 380 members, 37,410 check-ins and a payments
ledger that reconciled. Nobody had written down the rules it obeyed. They had to be read out
of the code, and then the same rules had to survive being moved into SQLite.

The four things below are what we would show a judge, in the order we would show them.

---

## 1. The rules had to be discovered before anything could be moved (4 min)

Read **[docs/01-inherited.md](docs/01-inherited.md)**.

Five behaviours were load-bearing and none of them were documented:

| Behaviour | How it was found | What it cost to get wrong |
| --- | --- | --- |
| Payments are append-only; a refund **adds** a row | `buildReversal()` in `payments-data.ts` — nothing edits a row | Editing in place makes gross/refunds/net unreproducible |
| There is no invoice entity — an invoice is a **derivation** over payments | `billing-data.ts` derives them; `lib/types.ts` has no invoice type | An `invoices` table would let the two disagree |
| A member's risk, a lead's age and a company's employee list are **derived, never stored** | They are recomputed on every render | Stored, `risk` is stale the moment somebody checks in |
| Unlimited plans store `consumesCredit: null`, and `0` is a real value | Read from the plan fixtures | A truthiness test lets a member with zero credits book forever |
| The clock is `NOW` from `lib/seed.ts`, never `new Date()` | The whole dataset is positioned relative to a fixed instant | The seeded world drifts out from under the tests overnight |

The schema in `server/db/schema.ts` is those five rules expressed as tables. That is why there
is no `invoices` table and why `class_seats` is rows rather than a JSON array.

## 2. The restructure had to be provably invisible (4 min)

Read **[docs/02-protecting-behaviour.md](docs/02-protecting-behaviour.md)**, then run:

```bash
pnpm verify:numbers      # 85 checks, no browser and no database needed
```

Every assertion re-derives its value **a second time, by a different route through the raw
entities**, and demands the two agree. A check that calls the app's own function and compares
the result to itself passes no matter what the function does; these do not.

It found a real defect on its first run: the dashboard's *Visits · 30 days* tile read **4,721**
directly above a heatmap built from **2,703** actual check-in rows. Same screen, 75% apart, and
both had been on the deployed site for days. They were two unrelated generators that nobody had
ever compared.

Two other things kept the restructure honest:

- **The seed is the original generators' output.** `scripts/build-seed-sql.mjs` bundles and runs
  the real `lib/data/` generators and writes what they produce, so the database holds exactly
  the numbers the screens rendered before there was a database. The migration was a change of
  storage, not of content.
- **The UI moved over via ESM live bindings.** `export const members` became `export let members`
  plus a `setMembers()`. Reassigning a `let` export makes all 44 importing modules see the new
  array with **zero changes at any call site** — which is why wiring 23 screens to a live API is
  a small diff rather than a rewrite.

## 3. The bug worth reading is the one nothing reported (4 min)

Read **[docs/03-failures.md](docs/03-failures.md) §1**.

`recomputeMemberMetrics` set a member's lifetime value to the sum of their `payments` rows. But
`payments` is **one billing cycle** — 65 rows covering 54 of 380 members — not a payment history.

So any recompute replaced a modelled multi-year figure with a single-cycle sum, or with zero.
**Scanning in at the kiosk was enough to trigger it.** The top member in the dataset drops from
₹4,32,378 to ₹0, loses the `vip` tag (which is `lifetimeValue >= 90000`), and sinks to the bottom
of a value-sorted directory. Nothing threw. No request failed. The number was simply wrong from
then on.

The fix stores a `metric_lifetime_base` and defines value as base + ledger, so a payment moves it
by exactly the payment. The backfill floor moves 2 members of 380 — and §1 argues why those two
moving is *correct* rather than drift.

**The first version of the test for this passed against the broken code.** It picked "any active
member", and for a member whose entire history sits inside the current cycle both formulas agree.
It now picks a member with history and no ledger rows, and asserts that such a member exists.

## 4. A toast is not evidence (3 min)

Read **[docs/04-testing.md](docs/04-testing.md)**.

The UI suites do not assert that a success message appeared. `scripts/test-buttons-ui.mjs` reads
D1, presses the real button in a real browser, reads D1 again, and compares. It also aborts every
`/api/trpc` request and asserts the app **refuses** rather than showing green over nothing.

That suite found two bugs on its first runs, and one of them only exists when React defers the
update — `e.currentTarget.value` read inside a `setDraft(d => …)` updater, which throws because
React nulls `currentTarget` once the handler returns. Every control on `/settings` was dead. A
hand test missed it.

Safe to run against the live site:

```bash
BASE=https://flexfit-studio.amitynoidalibrary.workers.dev pnpm smoke      # read-only
BASE=https://flexfit-studio.amitynoidalibrary.workers.dev pnpm test:live  # read-only
```

`pnpm test:api`, `test:buttons`, `test:ui` and `test:fixes` **write** — real refunds, real
check-ins — and belong against a local database you can reseed. [docs/04-testing.md](docs/04-testing.md)
explains why a mutating suite is the only honest way to test an append-only ledger, and why the
deploy pipeline therefore refuses to run one against production.

---

## What it does not do

Stated up front rather than found: **there is no authentication.** Any credentials open any door;
the sign-in screen says so. It is a demonstration of gym operations, not of access control.
[docs/07-limits.md](docs/07-limits.md) lists the rest, including one row of live data that is
damaged and deliberately left that way.

## How AI was used

[docs/06-ai-usage.md](docs/06-ai-usage.md), honestly and specifically — including the two places
where an AI-generated answer was wrong and what caught it.
