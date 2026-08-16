# Decisions we would be asked to defend

## Storage

**There is no `invoices` table.** An invoice is the set of `payments` rows sharing an
`invoiceId`. Storing it would create a second version of the same fact, and the two can then
disagree with nothing to notice. Dunning, pool health and reports are derivations for the same
reason, which is why `read.bootstrap` returns whole entities rather than pre-computed answers.

**Payments are append-only.** A refund inserts a negative row carrying `reversalOf`; nothing
updates a payment. Gross, refunds and net all reconcile by replaying the ledger. The cost is
that testing it requires mutating it — see [04-testing.md](04-testing.md).

**Class rosters are rows, not a JSON array.** A JSON array cannot express "insert only if the
class is under capacity" atomically. The composite primary key on `class_seats` makes
double-booking impossible at the storage layer, rather than prevented by application code that
has to remember.

**Metrics are flat `metric_*` columns.** The member directory sorts on them, so they have to be
indexable. A metrics blob turns every sort into a full scan.

**The attendance heatmap is materialised** — 168 rows rather than a `GROUP BY` over 37,410
check-ins, because **D1 bills rows scanned** and the live aggregate would spend the free daily
read budget in roughly a hundred page loads. The debt this creates is paid by an invariant that
runs on every deploy.

**Three fields are derived, not stored:** `member.risk`, `lead.ageDays`,
`company.employeeMemberIds`. The last was verified identical to the derived list before it was
dropped rather than assumed.

## Runtime

**Static export, not SSR.** Measured, not preferred: the SSR deploy returned 503 on 1 request in
12 under concurrency, because the App Router prefetches every visible link and each prefetch
became a server render. Static export gave 24 of 24. Full numbers in
[02-protecting-behaviour.md](02-protecting-behaviour.md).

**`AppRouter` crosses to the browser as a type only.** Renaming a procedure breaks the build
rather than production, and no server code, Drizzle or D1 driver reaches the client bundle.

**`html_handling: "auto-trailing-slash"` is load-bearing** — the export writes `/dashboard.html`,
not `/dashboard/index.html`.

**`not_found_handling` must be `"none"`.** With `"404-page"` the asset server answers
`/api/trpc/*` with the 404 HTML and the API is simply unreachable. The first symptom of this was
masked by a stale `wrangler dev` still holding the port.

**`@cloudflare/workers-types` must not go in tsconfig `types`.** One shared tsconfig carries
`lib: dom` for React, and Cloudflare's `Response` and `ReadableStream` are incompatible with the
DOM ones, so every `env.ASSETS.fetch()` fails to type-check. `AssetFetcher` is declared
structurally instead.

## Product

**Email configuration is a Worker secret, never a form field.** A Resend key typed into this app
could only be stored in the database it serves to every browser. Settings → Email offers a **test
send** instead, which is the only honest check: a key can be valid while the sender domain is not,
and that fails only at send time.

**Sending refuses honestly with no key**, naming the command that fixes it, rather than showing a
success state.

**A broadcast sends one message per recipient.** Two hundred addresses in one `to:` leaks every
address to all of them. The result reports sent *and* failed counts.

**Bulk actions loop one member at a time**, so a refusal on the ninth leaves members one to eight
correctly changed, and the toast reports both numbers. A single batched call that half-fails is
indistinguishable from one that wholly failed.

**The role switcher was removed.** It let a member read the owner's navigation out of a dropdown
and step into it. The top bar names who you are and offers **Sign out**. Sign-up creates a
**member** — it previously called `rememberRole('owner')`, which is a public form handing out the
back office and 380 people's payment records.

**Three things are deliberately not faked.** A guest day pass has no member row, so it reaches the
door feed only, and says so. Reports offer *"Email this"* rather than *"Schedule"*, because nothing
in this app runs on a timer. SMS and push are labelled *(not connected)*.

**Report insights are omitted rather than softened when the data cannot carry them.** No
concentration statement for a percentage column — a share column summing to 100 makes "the top 3
hold 62%" true and useless. No spread statement when the smallest value is 0, because a ratio
against nothing is infinite, not large. Insights read the **full** result, never the visible slice;
inside "top 10" they would report 100% concentration every time.

**Trainer active/inactive moves `active` and `activeTo` together** — `active` *is* "no departure
date". It deliberately does not reassign that trainer's classes or clients, and that gap is what
produces the March attendance step-down described in [01-inherited.md](01-inherited.md).

## Deployment

**A schema change must reach D1 before the code that needs it.** Deploying first means every
request 500s on a missing column for the entire rollout, and it presents as a broken deploy rather
than a missing migration. The workflow therefore **blocks** any push that touches
`server/db/migrations/`; you apply the migration, then re-run from the Actions tab with *"Schema
change already applied"* ticked.

**The deploy pipeline runs the read-only suite, never the mutating one.** Reasoning in
[04-testing.md](04-testing.md).

**Always strip whitespace from a credential before using it.** GitHub stores a secret exactly as
pasted, trailing newline included. A newline inside the account id makes **curl exit 3 (URL
malformed)** while wrangler reports only a generic two-second auth error — which frames a
*token* problem and cost three runs. Both workflow steps `tr -d '[:space:]'` and warn when it
mattered.
