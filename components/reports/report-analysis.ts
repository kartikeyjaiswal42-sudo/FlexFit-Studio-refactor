/**
 * Reading a report's own table back as numbers.
 *
 * Reports render pre-formatted cells — "₹1,24,500", "62.4%", "1,284" — because
 * that is what a table should show. Everything a reader then wants from a
 * report (which row is biggest, what the column adds up to, sort by this,
 * chart that) needs the number back out of the string.
 *
 * The parse is deliberately strict. A cell only counts as numeric when the
 * WHOLE string is a number with an optional currency mark or percent sign; a
 * value like "3 of 12" or "Riverside" returns null rather than 3. A loose parse
 * would happily average the first digits of a name and print the result as a
 * finding, which is the class of error this file exists to avoid.
 */

import type { ReportColumn, ReportRow } from './reports-data'

export type ColumnKind = 'label' | 'currency' | 'percent' | 'number'

const NUMERIC = /^-?[₹$€£]?\s*-?[\d,]+(\.\d+)?\s*%?$/

/** The number a cell holds, or null when the cell is not purely a number. */
export function numericValue(cell: string | number): number | null {
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : null
  const text = cell.trim()
  if (!text || !NUMERIC.test(text)) return null
  const parsed = Number(text.replace(/[₹$€£,%\s]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function cellKind(cell: string | number): ColumnKind {
  if (numericValue(cell) === null) return 'label'
  const text = String(cell)
  if (text.includes('%')) return 'percent'
  if (/[₹$€£]/.test(text)) return 'currency'
  return 'number'
}

/**
 * What each column holds. A column is numeric only if every non-empty cell in
 * it parses — one stray "—" or "n/a" and it stays a label column, because a
 * total computed over a column with holes in it is a wrong total.
 */
export function classifyColumns(columns: ReportColumn[], rows: ReportRow[]): ColumnKind[] {
  return columns.map((_col, i) => {
    const cells = rows.map((r) => r.cells[i]).filter((c) => c !== undefined && String(c).trim() !== '')
    if (cells.length === 0) return 'label'
    const kinds = cells.map(cellKind)
    if (kinds.some((k) => k === 'label')) return 'label'
    if (kinds.some((k) => k === 'percent')) return 'percent'
    if (kinds.some((k) => k === 'currency')) return 'currency'
    return 'number'
  })
}

export interface ColumnSummary {
  index: number
  label: string
  kind: Exclude<ColumnKind, 'label'>
  /** Omitted for percentages — see below. */
  total: number | null
  average: number
  max: number
  /** The label-column value of the row holding `max`, when there is one. */
  maxRow: string | null
  formatted: {
    total: string | null
    average: string
    max: string
  }
}

function formatLike(sample: string | number, value: number): string {
  const text = String(sample)
  const rounded = Math.round(value * 10) / 10
  const body = Number.isInteger(rounded)
    ? rounded.toLocaleString('en-IN')
    : rounded.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  if (text.includes('%')) return `${body}%`
  const currency = /[₹$€£]/.exec(text)
  return currency ? `${currency[0]}${body}` : body
}

/**
 * Totals, averages and the biggest row, per numeric column.
 *
 * Percentages get no total on purpose: adding up a "share of revenue" column
 * gives 100, and adding up a "fail rate" column gives a number that means
 * nothing at all. Printing either as a total is exactly the kind of confident
 * wrong number a report should never produce.
 */
export function summarise(
  columns: ReportColumn[],
  rows: ReportRow[],
  kinds: ColumnKind[],
): ColumnSummary[] {
  const labelIndex = kinds.findIndex((k) => k === 'label')
  const out: ColumnSummary[] = []

  kinds.forEach((kind, i) => {
    if (kind === 'label') return
    const values: { value: number; row: ReportRow }[] = []
    for (const row of rows) {
      const value = numericValue(row.cells[i] ?? '')
      if (value !== null) values.push({ value, row })
    }
    if (values.length === 0) return

    const total = values.reduce((s, v) => s + v.value, 0)
    const average = total / values.length
    const biggest = values.reduce((best, v) => (v.value > best.value ? v : best), values[0])
    const sample = biggest.row.cells[i] ?? ''

    out.push({
      index: i,
      label: columns[i].label,
      kind,
      total: kind === 'percent' ? null : total,
      average,
      max: biggest.value,
      maxRow: labelIndex >= 0 ? String(biggest.row.cells[labelIndex] ?? '') : null,
      formatted: {
        total: kind === 'percent' ? null : formatLike(sample, total),
        average: formatLike(sample, average),
        max: formatLike(sample, biggest.value),
      },
    })
  })

  return out
}

/** Rows ordered by one column, numerically where the column allows it. */
export function sortRows(
  rows: ReportRow[],
  index: number,
  direction: 'asc' | 'desc',
  kind: ColumnKind,
): ReportRow[] {
  const sign = direction === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const av = a.cells[index] ?? ''
    const bv = b.cells[index] ?? ''
    if (kind !== 'label') {
      const an = numericValue(av)
      const bn = numericValue(bv)
      // Unparseable cells sink to the bottom either way rather than sorting as 0.
      if (an === null && bn === null) return 0
      if (an === null) return 1
      if (bn === null) return -1
      return (an - bn) * sign
    }
    return String(av).localeCompare(String(bv)) * sign
  })
}

/** Rows containing the search text in any cell. */
export function filterRows(rows: ReportRow[], query: string): ReportRow[] {
  const q = query.trim().toLowerCase()
  if (!q) return rows
  return rows.filter((row) => row.cells.some((cell) => String(cell).toLowerCase().includes(q)))
}

export type RowScope = 'all' | 'top' | 'above' | 'below' | 'flagged'

export const ROW_SCOPES: { id: RowScope; label: string; hint: string }[] = [
  { id: 'all', label: 'All rows', hint: 'The whole result' },
  { id: 'top', label: 'Top 10', hint: 'The ten largest by the leading column' },
  { id: 'above', label: 'Above average', hint: 'Rows above the mean of the leading column' },
  { id: 'below', label: 'Below average', hint: 'Rows below the mean — usually the ones to act on' },
  { id: 'flagged', label: 'Flagged', hint: 'Rows the report itself marked as warning or danger' },
]

/**
 * Narrow the result to a slice worth looking at.
 *
 * "Below average" is the one that earns its place: on almost every report here
 * the interesting rows are the weak ones — the classes nobody books, the plans
 * nobody renews — and finding them by eye in a 40-row table is how they get
 * missed. `index` is the column the slice is measured on, which is the sorted
 * column when the reader has picked one and the first numeric column otherwise.
 */
export function scopeRows(rows: ReportRow[], scope: RowScope, index: number): ReportRow[] {
  if (scope === 'all') return rows
  if (scope === 'flagged') return rows.filter((r) => r.tone === 'warn' || r.tone === 'danger')
  if (index < 0) return rows

  const valued = rows
    .map((row) => ({ row, value: numericValue(row.cells[index] ?? '') }))
    .filter((v): v is { row: ReportRow; value: number } => v.value !== null)
  if (valued.length === 0) return rows

  if (scope === 'top') {
    return [...valued].sort((a, b) => b.value - a.value).slice(0, 10).map((v) => v.row)
  }
  const mean = valued.reduce((s, v) => s + v.value, 0) / valued.length
  return valued.filter((v) => (scope === 'above' ? v.value > mean : v.value < mean)).map((v) => v.row)
}

export interface Insight {
  /** Short heading — what the sentence is about. */
  label: string
  /** The finding, in one sentence. */
  text: string
  tone: 'default' | 'warn'
}

/**
 * Findings the report's own numbers support, and nothing more.
 *
 * Every sentence here is arithmetic over the rendered table: concentration,
 * spread, how many rows sit either side of the mean, how many the report itself
 * flagged. Nothing is inferred about WHY, because the data cannot support that
 * and a plausible-sounding cause printed next to a real number is the most
 * dangerous thing a reports screen can do.
 *
 * A finding is omitted rather than softened when the shape of the data will not
 * support it — one row cannot be concentrated, and a column containing a zero
 * has no meaningful ratio between its largest and smallest values.
 */
export function deriveInsights(
  columns: ReportColumn[],
  rows: ReportRow[],
  kinds: ColumnKind[],
): Insight[] {
  const out: Insight[] = []
  if (rows.length === 0) return out

  const labelIndex = kinds.findIndex((k) => k === 'label')
  const leadIndex = kinds.findIndex((k) => k !== 'label')
  if (leadIndex < 0) return out

  const label = columns[leadIndex].label
  const valued = rows
    .map((row) => ({ row, value: numericValue(row.cells[leadIndex] ?? '') }))
    .filter((v): v is { row: ReportRow; value: number } => v.value !== null)
  if (valued.length === 0) return out

  const nameOf = (row: ReportRow) => (labelIndex >= 0 ? String(row.cells[labelIndex] ?? '') : 'that row')
  const sorted = [...valued].sort((a, b) => b.value - a.value)
  const total = valued.reduce((s, v) => s + v.value, 0)
  const mean = total / valued.length

  // Concentration. Only meaningful for things that add up — a share column
  // summing to 100 would produce a true but useless "the top 3 hold 62%".
  if (kinds[leadIndex] !== 'percent' && valued.length >= 4 && total > 0) {
    const take = Math.min(3, Math.max(1, Math.floor(valued.length / 3)))
    const share = (sorted.slice(0, take).reduce((s, v) => s + v.value, 0) / total) * 100
    out.push({
      label: 'Concentration',
      text: `The top ${take} of ${valued.length} rows carry ${share.toFixed(0)}% of ${label.toLowerCase()} — ${sorted
        .slice(0, take)
        .map((v) => nameOf(v.row))
        .join(', ')}.`,
      tone: share >= 60 ? 'warn' : 'default',
    })
  }

  // Spread. Skipped when the smallest value is zero: a ratio against nothing is
  // infinite, not large.
  const smallest = sorted[sorted.length - 1]
  const largest = sorted[0]
  if (valued.length >= 2 && smallest.value > 0 && largest.value !== smallest.value) {
    out.push({
      label: 'Spread',
      text: `${nameOf(largest.row)} is ${(largest.value / smallest.value).toFixed(1)}× ${nameOf(smallest.row)} on ${label.toLowerCase()}.`,
      tone: 'default',
    })
  }

  const below = valued.filter((v) => v.value < mean).length
  if (valued.length >= 3) {
    out.push({
      label: 'Distribution',
      text: `${below} of ${valued.length} rows fall below the average — the average is pulled up by the top of the list, not typical of it.`,
      tone: 'default',
    })
  }

  const flagged = rows.filter((r) => r.tone === 'warn' || r.tone === 'danger').length
  if (flagged > 0) {
    out.push({
      label: 'Flagged by the report',
      text: `${flagged} of ${rows.length} rows are marked as needing attention by this report's own thresholds.`,
      tone: 'warn',
    })
  }

  const zeros = valued.filter((v) => v.value === 0).length
  if (zeros > 0) {
    out.push({
      label: 'Empty rows',
      text: `${zeros} ${zeros === 1 ? 'row contributes' : 'rows contribute'} nothing to ${label.toLowerCase()} at all.`,
      tone: 'warn',
    })
  }

  return out
}
