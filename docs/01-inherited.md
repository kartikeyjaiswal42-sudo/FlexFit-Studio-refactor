# What we inherited, and what had to be discovered

## The starting point

A merged Next.js tree — 23 screens across 25 routes, delivered as batches 1 through 9 and
recorded file-by-file in [00-inherited-batches.md](00-inherited-batches.md). Next.js 16.3.0,
React 19, Tailwind v4, TypeScript 5.7.3, `@base-ui/react`, pnpm.

**It had no backend of any kind.** No route handlers, no server actions, no database, no
`cookies()` or `headers()`. Every screen derived its numbers at module load from seeded
constants in `lib/data/`. Buttons fired a `toast()` and changed nothing.

What it did have was a *coherent* simulated gym: 380 members, 37,410 check-ins, a payments
ledger where gross, refunds and net reconcile, a cohort retention triangle, twelve reports and
a corporate credit pool with a burn projection. The numbers agreed with each other across
screens. That coherence is the thing that had to survive.

## Four defects, fixed before anything was restructured

Nothing gets rebuilt on top of a tree that is quietly broken.

**1. A hydration mismatch on `/billing/dunning`.** `components/billing/billing-data.ts` held a
module-level `const rng = makeRng(0x8111e0)` that `dunningQueue()` consumed. `makeRng` is
**stateful**, and `dunningQueue()` runs once during the server render and again during
hydration — by the second call the shared generator had already advanced, so the client drew
different dates ("16 Aug" against "15 Aug") and React discarded the tree.

Worth recording because of what was suspected first and cleared: `lib/seed.ts`'s `NOW` and
`isoDate` were both prime suspects and both proved innocent, and the timezone theory was tested
across three zones and disproved. The fix is a per-call re-seed.

**2. The same defect, latent, in `corporate-data.ts`.** `employeeUsage()` had the identical
shape and did not reproduce only because that route re-renders less often. Fixed defensively,
and then all seven module-level RNGs were audited: the six in `lib/data/*` are safe, because
each is consumed exactly once at module load (`export const x = build()`).

**3. Horizontal scroll at 390px.** The attendance heatmap's `min-w-[34rem]` table inflated its
own `overflow-x-auto` wrapper, because **a grid or flex item defaults to `min-width: auto`** —
so the card grew to the table's width instead of letting the table scroll inside it. `min-w-0`
on that card and the two others with the same pattern.

**4. A type error hidden by `typescript.ignoreBuildErrors: true`.** `CardHeader` intersected
`React.HTMLAttributes` — which already declares `title?: string`, the HTML tooltip attribute —
with `title?: React.ReactNode`, producing the impossible type `string & ReactElement`.
`corporate-list.tsx` could not type-check. Fixed with `Omit<…, 'title'>`; `tsc --noEmit` is
clean and the escape hatch is no longer load-bearing.

## The five rules that were never written down

These were read out of the code. Each one is now a constraint on the schema, and each one has
a cost attached to getting it wrong.

### Payments are append-only

`buildReversal()` constructs a new row; nothing in the tree edits a payment. A refund is a
negative row carrying `reversalOf`, and gross, refunds and net are all obtained by replaying
the ledger.

Editing a payment in place would make history unreproducible — you could no longer answer "what
did this member pay in March" after a refund landed in April. The database enforces this by
having no update path for a payment row.

### An invoice is a derivation, not an entity

`billing-data.ts` computes invoices from `lib/data/payments.ts`, with the GST split and the
dunning ladder derived alongside. `lib/types.ts` has no invoice type. An invoice **is** the set
of payment rows sharing an `invoiceId`.

This is why there is no `invoices` table, and why `read.bootstrap` returns whole entities rather
than pre-chewed answers: the moment an invoice becomes a stored row, it can disagree with the
payments it summarises, and nothing will notice.

### Three fields are absent because they are derived

- **`member.risk`** — stale the moment somebody checks in.
- **`lead.ageDays`** — wrong by the next morning.
- **`company.employeeMemberIds`** — `members.company_id` already says it. This one was
  *verified identical* against the derived list before it was dropped, rather than assumed.

### `consumesCredit: null` means unlimited, and `0` is a real value

Test it with `typeof === 'number'`, never for truthiness. A truthiness test treats a member on
zero remaining credits exactly like a member on an unlimited plan, and lets them book forever.

### The clock is `NOW` from `lib/seed.ts`

The whole dataset is positioned relative to one fixed instant. Using `new Date()` anywhere makes
the seeded world drift out from under its own tests overnight — the March attendance step-down
stops falling in March, and cohort triangles stop lining up.

## One piece of behaviour that looks like a bug and is not

Attendance steps down in March. It is not a data error: a trainer left, and the roster in
`trainers-data.ts` still contains them. The step-down is that departure showing up in the
numbers. Anything that "fixes" it has broken the dataset's internal consistency.

This is the clearest example of why the rules had to be discovered before the restructure
started. A reasonable person, seeing a 30% drop in a metric, smooths it.

## Provenance of the merged tree

`flex-fit-gym-management-hey.zip` — the design pass that was merged in alongside the back
office — was committed to this repository in `066a290` and is no longer carried in the working
tree. Its contents are the code that now lives in `app/` and `components/`; the archive itself
is 15 MB of duplicate, recoverable with:

```bash
git show 066a290:flex-fit-gym-management-hey.zip > baseline.zip
```
