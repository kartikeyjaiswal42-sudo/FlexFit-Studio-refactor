# FlexFit Studio — merged tree (Batches 1 → 9)

Single Next.js 16 / Tailwind v4 / TypeScript app. Batches 1–7 are the tree you
uploaded, unchanged. Batches 8 and 9 are new files added on top, plus exactly one
wiring edit (noted below).

```bash
pnpm install
pnpm dev
```

## What Batch 8 added — billing, payments, corporate, leads, trainers

| File | Purpose |
| --- | --- |
| `components/billing/billing-data.ts` | Invoices derived from `lib/data/payments.ts` (never a new entity), GST split, dunning ladder, plan-draft impact math |
| `components/billing/billing-tabs.tsx` | Route-level sub-nav for the three billing screens |
| `components/billing/invoice-list.tsx` | Invoice table: status filters, sortable columns, collection KPIs |
| `components/billing/invoice-detail.tsx` | Line items, ledger with paired reversals, retry / refund with stated consequence |
| `components/billing/dunning-queue.tsx` | 5-rung recovery ladder, rung filter, retry / called / pause-access with undo |
| `components/billing/plan-builder.tsx` | Plan editor with live MRR delta and an over-allowance warning before publish |
| `app/(app)/billing/page.tsx`, `billing/invoices/[id]`, `billing/dunning`, `billing/plans` | Routes |
| `components/payments/payments-data.ts` | Append-only ledger rows, method split, `buildReversal()` |
| `components/payments/payments-ledger.tsx` | Ledger with reversal rows nested under their original; refund adds a row, never edits one |
| `app/(app)/payments/page.tsx` | Route |
| `components/corporate/corporate-data.ts` | Pool health, 12-week burn history, forward projection, per-employee usage |
| `components/corporate/corporate-list.tsx` | Pools ranked by exhaustion risk + near-exhausted warning |
| `components/corporate/pool-detail.tsx` | Burn chart (history + dashed projection), contract facts, employee table, top-up |
| `app/(app)/corporate/page.tsx`, `corporate/[id]` | Routes |
| `components/leads/leads-data.ts` | Stage SLAs, aging, funnel, pipeline value, loss reasons |
| `components/leads/leads-board.tsx` | Six-column kanban, drag-to-move + accessible stage select, aging chips |
| `components/leads/lead-panel.tsx` | Lead sheet: contact, stage move, loss reason, note |
| `app/(app)/leads/page.tsx` | Route |
| `components/trainers/trainers-data.ts` | Load, seat fill, assigned-client retention, illustrative payroll |
| `components/trainers/trainer-roster.tsx` | Roster incl. the departed trainer (drives the March 2025 attendance step-down) |
| `components/trainers/trainer-detail.tsx` | Weekly schedule, cost, assigned members by risk |
| `app/(app)/trainers/page.tsx`, `trainers/[id]` | Routes |

## What Batch 9 added — notifications, reports, portal, settings, system, ⌘K, J/K

| File | Purpose |
| --- | --- |
| `components/command/command-palette.tsx` | ⌘K palette: grouped nav / members / invoices / pools / actions, role-filtered |
| `components/command/use-list-traversal.tsx` | `useListTraversal()` + `TraversalHint` — J/K/Enter, sets `data-focused` (already styled by `ui/table` `Tr`) |
| `components/notifications/notification-center.tsx` | Event feed with kind filters, mark-read, deep links, J/K traversal |
| `components/notifications/broadcast-composer.tsx` | Segment → channel → message, with reach, per-message cost and opt-out exclusions before send |
| `components/reports/reports-data.ts` | 12 reports, each computed live from the seeded dataset, with takeaway + honest caveat |
| `components/reports/reports-library.tsx` | Library grouped by category, keyboard-traversable |
| `components/reports/report-view.tsx` | Takeaway above the table; caveats render as a null-result state |
| `components/portal/portal-home.tsx` | Member portal (phone-first): credits, next class, week, self-serve booking reusing Batch 6 dialogs, recent charges |
| `components/trainers/my-schedule.tsx` | Trainer's own week — the `/my-schedule` route the Batch 1 sidebar already linked to |
| `components/settings/settings-view.tsx` | Studio, booking policy, dunning ladder, role-access matrix, alert cadence, reset |
| `app/(app)/notifications`, `reports`, `reports/[slug]`, `portal`, `my-schedule`, `settings` | Routes |
| `app/not-found.tsx`, `app/error.tsx` | System screens (no-access already ships as `RequireScreen` from Batch 1) |

## The only edits to earlier-batch files

1. `app/page.tsx` — already replaced by Batch 7 with a redirect to `/dashboard`.
2. `app/(app)/layout.tsx` — **one added line**: `<CommandPalette />` mounted inside
   `AppProvider`, so it can read the `commandOpen` flag the Batch 1 top bar already
   toggles on ⌘K. Without this the top bar's ⌘K button and shortcut do nothing.

Nothing else from Batches 1–7 was touched: no token, primitive, shell or data file
was edited, and every new screen imports its data from `lib/data/*`.

## Conventions the new files follow

- Data derivations live beside the screen (`*-data.ts`), never in `lib/` — `lib/types.ts`
  stays the single type contract and no new seed entity was invented. Invoices,
  dunning items, pool health, lead cards and reports are all derived.
- Every destructive or money-moving action goes through `ConfirmDialog` /
  `ConsequenceNotice` and states its consequence before the confirm button.
- Status is never colour alone — `StatusChip` (marker + border + label) everywhere.
- One saturated accent for primary actions and current selection; status colours stay
  desaturated. No new colour values were added to `globals.css`.
- All numbers pass through `lib/format.ts` (en-IN / INR, fixed timezone) so server and
  client render identical strings.

## Known gaps for final wiring (Claude Code)

- `/schedule` drag-to-reschedule, the kiosk and check-in keep their Batch 4/6 session
  stores; the new screens use local component state and toasts with undo. Nothing
  persists across a reload by design.
- `useListTraversal` is applied on the Batch 9 lists; the Batch 3 member directory and
  Batch 5 intervention queue can adopt it with a two-line change each.
- Payroll figures in `trainers-data.ts` are illustrative (₹900/hr + ₹40/head), not a
  payroll integration.
