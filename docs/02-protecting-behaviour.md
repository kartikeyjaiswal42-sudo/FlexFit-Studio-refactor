# Protecting the behaviour while restructuring everything under it

The app had to keep saying the same things after a database appeared underneath it. This
records the four mechanisms that made that checkable rather than hoped for.

---

## 1. The seed is the original generators' output

The obvious way to seed a database is to write SQL that looks about right. That produces a
database which is *plausible* and which disagrees with the app it replaced.

Instead, `scripts/build-seed-sql.mjs` bundles the real `lib/data/` generators with esbuild,
runs them, and writes what they produce. The database therefore holds exactly the rows the
screens were already rendering: 380 members, 37,410 check-ins, 424 class seats, 193,136 rows
in production.

The migration was a change of **storage**, not of content. That makes the whole restructure
falsifiable — if a number moved, something is wrong, and there is no "well, the seed is
different now" to hide behind.

## 2. Three shapes changed on the way in, deliberately

Copying the in-memory shapes verbatim would have been the safest-looking choice and the wrong
one. Three of them had to change, and each change is a claim about what a database is for:

**Metrics became flat `metric_*` columns.** The member directory *sorts* on lifetime value,
visit count and risk. A metrics blob cannot be indexed, so a sort becomes a full scan of every
member on every page load.

**`roster` and `waitlist` arrays became `class_seats` rows.** A JSON array cannot express
"insert only if the class is under capacity" atomically. As rows with a composite primary key,
double-booking is impossible *at the storage layer* rather than prevented by application code
that has to remember to check.

**The attendance heatmap is materialised** — 168 rows instead of a `GROUP BY` over 37,410
check-ins. D1 bills rows **scanned**, so the live aggregate would spend the free daily read
budget in roughly a hundred page loads.

That last one creates a debt, and the debt is paid explicitly: any write path touching check-ins
must keep the two in step, and `smoke.mjs` re-asserts on every deploy that the materialised total
still equals `COUNT(*)`. Nothing errors when those drift apart. The numbers just stop matching,
which is why a permanent check exists rather than a comment.

## 3. ESM live bindings, so wiring 23 screens is a small diff

The backend shipped before the UI used it. Connecting them looked like it meant touching every
screen — 44 modules import from `lib/data/`.

It did not, because of one property of ES modules:

```ts
// before
export const members = buildMembers()

// after
export let members = buildMembers()
export function setMembers(next: Member[]) { members = next }
```

Reassigning a `let` export makes every importing module see the new array. **Zero call sites
changed.** `lib/data/hydrate.ts` swaps each entity from `read.bootstrap`, and the seven derived
modules gained a `rebuild()`.

Two things about it are load-bearing:

- **Order matters.** Entities first, then derivations. A derivation rebuilt against the old
  entities is worse than no hydration at all, because it is confidently stale.
- **The store re-reads the whole dataset after every write, before showing the toast**
  (`lib/store/studio-store.tsx`). Patching one entity locally is exactly how one screen's total
  starts disagreeing with another screen's rows — which is the failure mode this whole document
  exists to prevent.

When `/api/trpc` is unreachable the app says so and **refuses to write**, rather than showing a
green toast over nothing.

## 4. `verify:numbers` — 85 checks that re-derive by a second route

```bash
pnpm verify:numbers      # no browser, no database
```

The rule the suite is built on: **a check that calls the app's own function and compares the
result to itself passes regardless of whether the function is right.** So every assertion
re-derives its value a second time from the raw entities, by a different path, and demands the
two agree.

It was proved able to fail before it was trusted, and it earned its place on its first run by
finding a defect that had been live for days: the dashboard's *Visits · 30 days* tile read
**4,721** directly above a heatmap summing **2,703** actual check-in rows. Same screen, 75%
apart. They were two unrelated generators — `dailyAttendance` and `checkIns` — that nobody had
ever compared, because individually each looked completely reasonable.

Daily totals now **count** the events over the 364 days the two sources share; the older tail
stays modelled and is scaled to meet the seam. `migrations/0002_attendance_reconcile.sql` repairs
data already in D1 rather than re-seeding, so the 37,410 check-in rows are untouched — and it was
proved idempotent over three runs before it went anywhere near production.

---

## Why the app is a static export, measured rather than assumed

The first deploy used `@opennextjs/cloudflare`, and every route answered 200 when probed one at
a time. Under concurrency, **1 request in 12 returned 503**. A real browser was far worse,
because the App Router prefetches every visible link — roughly ten concurrent server renders per
navigation. The test suite fell to 18 of 28 against production, with 45-second timeouts.

`output: 'export'` writes 481 static HTML pages, which Cloudflare's asset router matches
**before** the Worker runs. Concurrency went to 24 of 24, and the production suite to 28 of 28.
A page load now costs no Worker CPU at all.

The lesson generalises past this project: **a route that only passes when probed alone is not
passing.** Pace probes against production.

`AppRouter` crosses into the browser as a **type only**, so renaming a procedure breaks the
build rather than production, and no server code, Drizzle or D1 driver reaches the client bundle.

## The one thing static export cannot do, and what it cost

A static export writes one file per record **that existed at build time**. So `/members/m-new-…`
— a member created after the build — had no page, and the Worker's fallback served the section
index. Adding a member bounced you back to the directory with the URL still reading
`/members/m-new-…`. The profile, its billing tab and every invoice minted for that member were
unreachable.

The fix is two shells that read the id back out of the URL, with `worker/index.ts` mapping each
prefix to a specific shell, longest-prefix first. Neither shell says "not found" until the store
has left `connecting` — before hydration the client holds only the seed, so answering early
reports every new member as missing.

This is recorded here because it is the kind of defect that reads as three unrelated complaints
("the new member vanished", "invoices don't generate", "there's no email button") and is one
architectural consequence.
