# What this does not do

Stated here rather than discovered.

## There is no authentication

**Any credentials open any door.** The sign-in screen says so on the page. Roles are remembered
in `flexfit_role` and gate what the navigation offers; nothing verifies who you are.

This is a demonstration of gym operations, not of access control. Two things were nevertheless
fixed because they were worse than "no auth" — they were *misleading*:

- The role switcher let a member read the owner's navigation out of a dropdown and step into it.
  Removed.
- Sign-up called `rememberRole('owner')` — a public form handing out the back office and 380
  people's payment records. It creates a member now.

Demo accounts fill the sign-in form per role so nothing has to be typed, and only while the field
still holds a suggestion, so your own address survives a role change.

## One row of production data is damaged, deliberately

Member `m-0320` reads ₹0 lifetime value on the live site.

A previous session ran the **mutating** `test-api` suite against production. It refunded a seeded
₹49,000 payment — `pay-rev-pay-0033` is not in the seed — and the old lifetime-value formula then
zeroed the member. Migration 0004 carried that state forward faithfully, because it backfills from
what the ledger actually records.

The exact repair is deleting that one test-created reversal row. **It has not been done**, because
the ledger is append-only by design, this is live financial data, and deciding to delete from it is
the owner's call rather than ours. It is recorded here instead of quietly fixed.

It is also the clearest possible argument for the rule in [04-testing.md](04-testing.md): point a
mutating suite at a database you can reseed, never at production.

## Channels that are not connected

- **SMS and push** have no provider. They are labelled *(not connected)* in the UI rather than
  faked with a toast.
- **Email really sends**, through Resend, but only once `RESEND_API_KEY` and `EMAIL_FROM` are
  bound as Worker secrets. Until then the app refuses and names the command. The delivery path is
  therefore **unproven end-to-end** in any environment without a key, and a key can be valid while
  the sender domain is not — which is what Settings → Email → *Send a test* exists for.

## Product gaps

- **No `/equipment/[id]` detail route.** The register, the fault log and reservations all work;
  there is no per-asset page.
- **A guest day pass reaches the door feed only.** There is no member row to attach it to, and the
  UI says so rather than inventing one.
- **Reports offer "Email this", not "Schedule".** Nothing in this app runs on a timer, so a
  schedule button would be a promise it cannot keep.
- **Payroll figures in `trainers-data.ts` are illustrative** (₹900/hr + ₹40/head), not a payroll
  integration.

## Data caveats

- **The dataset is seeded, and positioned relative to a fixed instant** (`NOW` in `lib/seed.ts`).
  It is a coherent simulated gym, not real members.
- **The March attendance step-down is real behaviour, not a defect.** A trainer left and their
  classes were never reassigned. Smoothing it would break the dataset's internal consistency —
  see [01-inherited.md](01-inherited.md).
- **The older tail of daily attendance is modelled**, scaled to meet the 364 days that are counted
  from real check-in rows. The seam is deliberate and documented in
  [03-failures.md](03-failures.md) §3.

## Coverage gaps in testing

Everything mutating is local-only, so **no suite exercises a write path against production** by
design. `smoke` and `test:live` cover production read-only. The retention queue's compose-and-send
path is verified locally; an actual delivered email is not asserted anywhere, because that requires
a key and a verified domain.
