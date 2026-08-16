# How AI was used

AI tooling was used throughout this project, at every stage. This records where, and — more
usefully — the specific places where it was wrong and what caught it.

## The inherited tree was itself AI-generated

The 23-screen front end arrived from a generative UI tool (the `.gitignore` still carries its
sandbox files). That is directly relevant to the shape of this project rather than incidental:
**it is why none of the rules the app obeyed were written down anywhere.** A generated tree is
internally coherent and has no design record. Reconstructing the five load-bearing rules in
[01-inherited.md](01-inherited.md) by reading the code was the first week's real work, and it
existed because of how the code was produced.

## Where AI was used

- **Implementation.** Most of the code in the restructure — the tRPC routers, the Drizzle
  schema, the migrations, the hydration layer, the test suites — was written with an AI coding
  assistant.
- **Investigation.** Reading unfamiliar code to answer "what does this actually do", tracing a
  hydration mismatch, working out why concurrent requests 503'd.
- **This documentation.** Drafted with assistance from the working changelog kept during the
  build.

## Where it was wrong

These are the ones that reached committed code.

**1. A test that encoded the bug it was named after.** The double-count assertion was written as
`heatBefore + 2` — the value the broken code produced — under the name *"does not double-count"*.
It passed, and it passed *because* the code was wrong. Nothing about the test looked incorrect;
the name described the intent and the assertion described the defect. Caught only by separately
comparing the materialised heatmap against `COUNT(*)`, which is now a permanent invariant.
([03-failures.md](03-failures.md) §2.)

**2. A test that passed against broken code by picking a convenient subject.** The first lifetime-value
test selected "any active member". For a member whose entire payment history sits inside the
current billing cycle, the broken formula and the correct one agree — so the test was green
against both. It now picks a member with history and no ledger rows, and asserts that such a
member exists. ([03-failures.md](03-failures.md) §1.)

**3. Selector mistakes indistinguishable from product bugs.** A generated Playwright suite
reported two failures that were its own errors: a `button, a` locator matching the sidebar nav
link before the tab, and a click on a correctly-disabled control reported as *"waiting for
locator"*, which reads exactly like "this button does not exist". Both would have sent someone
to fix working code.

**4. Documentation that went stale and kept asserting.** The README's status section continued to
say the UI did not persist for several versions after it did. Nothing enforces a prose claim.

## What that pattern says

The recurring failure is not bad code. It is **confident verification** — tests that pass for the
wrong reason, and prose that keeps asserting something that stopped being true.

So the discipline that matters is not reviewing generated code more carefully, though that helps.
It is:

- **Prove a check can fail before trusting it.** `verify:numbers` and the lifetime-value checks
  were both run against deliberately reverted code to confirm they reddened.
- **Never let a check compare a value to itself.** Re-derive it by a second route.
- **Read the database on both sides of an action**, rather than believing a toast.
- **Put invariants in the deploy pipeline**, where they run whether or not anyone remembers them.

Every claim in this repository's documentation was checked against the code or a suite run before
it was written down. Where a number could not be verified, it is not stated.
