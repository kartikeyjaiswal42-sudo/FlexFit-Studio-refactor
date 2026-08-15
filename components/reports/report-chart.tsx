'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Select } from '@/components/ui/input'
import type { ReportColumn, ReportRow } from './reports-data'
import { numericValue, type ColumnKind } from './report-analysis'

/**
 * The report's table, drawn.
 *
 * Horizontal bars rather than a plotted chart, and hand-built out of divs like
 * the dashboard's own charts: report rows are categories (a plan, a trainer, an
 * hour of the day), the labels are long, and a bar you can read the label off
 * beats an axis you have to squint at. No charting dependency is added for it.
 *
 * Which column is plotted is the reader's choice, because "which is biggest"
 * has a different answer for members than it does for revenue — the two
 * questions a report of this shape usually gets asked.
 */
export function ReportChart({
  columns,
  rows,
  kinds,
  /** Rows worth drawing before it stops being a chart and becomes a table again. */
  limit = 14,
}: {
  columns: ReportColumn[]
  rows: ReportRow[]
  kinds: ColumnKind[]
  limit?: number
}) {
  const labelIndex = kinds.findIndex((k) => k === 'label')
  const numericIndexes = kinds.map((k, i) => (k === 'label' ? -1 : i)).filter((i) => i >= 0)
  const [plotted, setPlotted] = React.useState<number>(numericIndexes[0] ?? -1)

  // A report whose columns changed (navigating between reports reuses this
  // component) must not keep plotting a column index that no longer exists.
  React.useEffect(() => {
    setPlotted((current) => (numericIndexes.includes(current) ? current : numericIndexes[0] ?? -1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns])

  if (labelIndex < 0 || plotted < 0) return null

  const points = rows
    .map((row) => ({
      label: String(row.cells[labelIndex] ?? ''),
      display: String(row.cells[plotted] ?? ''),
      value: numericValue(row.cells[plotted] ?? '') ?? 0,
      tone: row.tone,
    }))
    .filter((p) => p.label !== '')

  if (points.length === 0) return null

  const shown = points.slice(0, limit)
  // Bars are drawn against the largest magnitude, so a column holding negatives
  // (a refund total, a net movement) still scales sensibly instead of vanishing.
  const scale = Math.max(...points.map((p) => Math.abs(p.value)), 1)
  const hasNegative = points.some((p) => p.value < 0)

  return (
    <Card>
      <CardHeader
        title="At a glance"
        description={
          shown.length < points.length
            ? `Top ${shown.length} of ${points.length} rows, in table order.`
            : `All ${points.length} rows, in table order.`
        }
        actions={
          numericIndexes.length > 1 ? (
            <Select
              aria-label="Which column to plot"
              value={String(plotted)}
              onChange={(e) => setPlotted(Number(e.currentTarget.value))}
              className="h-7 w-auto"
            >
              {numericIndexes.map((i) => (
                <option key={i} value={i}>
                  {columns[i].label}
                </option>
              ))}
            </Select>
          ) : null
        }
      />
      <CardBody className="flex flex-col gap-1.5">
        {shown.map((point, i) => (
          <div key={`${point.label}-${i}`} className="flex items-center gap-2">
            <span
              className="w-32 shrink-0 truncate text-micro text-muted-foreground sm:w-44"
              title={point.label}
            >
              {point.label}
            </span>
            <span className="relative flex h-4 min-w-0 flex-1 items-center rounded-sm bg-muted">
              <span
                className={cn(
                  'h-full rounded-sm transition-[width] duration-300 ease-[var(--ease-ui)]',
                  point.value < 0
                    ? 'bg-danger'
                    : point.tone === 'danger'
                      ? 'bg-danger'
                      : point.tone === 'warn'
                        ? 'bg-warn'
                        : point.tone === 'good'
                          ? 'bg-good'
                          : 'bg-primary',
                )}
                style={{ width: `${Math.max((Math.abs(point.value) / scale) * 100, point.value === 0 ? 0 : 1.5)}%` }}
              />
            </span>
            <span className="w-20 shrink-0 text-right text-micro font-medium text-foreground tnum">
              {point.display}
            </span>
          </div>
        ))}
        {hasNegative ? (
          <p className="pt-1 text-micro text-muted-foreground">
            Bars show magnitude; negative values are drawn in red.
          </p>
        ) : null}
      </CardBody>
    </Card>
  )
}
