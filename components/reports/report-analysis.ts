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
