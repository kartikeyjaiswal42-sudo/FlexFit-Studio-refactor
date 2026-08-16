# Documentation

**Evaluating this project?** [JUDGES.md](../JUDGES.md) is a fifteen-minute path through it.
Everything below is the long form.

| | |
| --- | --- |
| [00-inherited-batches.md](00-inherited-batches.md) | The merged tree as delivered — every file in batches 8 and 9, and the single wiring edit made to earlier batches |
| [01-inherited.md](01-inherited.md) | What we started with, the four defects fixed on arrival, and **the five load-bearing rules that were never written down** |
| [02-protecting-behaviour.md](02-protecting-behaviour.md) | How a database was put underneath 23 screens without changing what any of them said |
| [03-failures.md](03-failures.md) | Five defects that reached working code. Four produced no error at all |
| [04-testing.md](04-testing.md) | What runs, where it is safe to run it, and why some suites must mutate |
| [05-decisions.md](05-decisions.md) | Decisions we would be asked to defend, with the reasoning attached |
| [06-ai-usage.md](06-ai-usage.md) | Where AI was used, and the four places it was confidently wrong |
| [07-limits.md](07-limits.md) | What this does not do — including one row of live data that is damaged and deliberately left that way |

## Reading order

**If you have ten minutes:** [JUDGES.md](../JUDGES.md).

**If you want the argument:** [01-inherited.md](01-inherited.md) → [02-protecting-behaviour.md](02-protecting-behaviour.md)
→ [03-failures.md](03-failures.md). Those three are the project: what the rules were, how they
were kept, and what got through anyway.

**If you are going to change something:** [05-decisions.md](05-decisions.md) first, then
[04-testing.md](04-testing.md) before you run anything against a database you care about.
