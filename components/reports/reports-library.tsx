'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileBarChart } from 'lucide-react'
import { PageHeader, PageBody } from '@/components/shell/page-header'
import { RequireScreen } from '@/components/shell/app-shell'
import { Card, CardHeader } from '@/components/ui/card'
import { FilterTrigger } from '@/components/ui/filter-chip'
import { StatusChip } from '@/components/ui/status-chip'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { num } from '@/lib/format'
import { useListTraversal, TraversalHint } from '@/components/command/use-list-traversal'
import { REPORTS, REPORT_CATEGORIES, type ReportCategory, type ReportDef } from './reports-data'

/**
 * Reports library. Each entry states the question it answers, not the columns it
 * contains — an operator picks a report by the decision they need to make.
 */
export function ReportsLibrary() {
  const router = useRouter()
  const [category, setCategory] = React.useState<'all' | ReportCategory>('all')
  const [query, setQuery] = React.useState('')

  /**
   * Search covers the QUESTION as well as the title, because that is how people
   * look for a report: "why are people leaving", "which classes are empty".
   * Matching titles alone means knowing what the report is called before you can
   * find it, which is the wrong way round.
   */
  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return REPORTS.filter((r) => {
      if (category !== 'all' && r.category !== category) return false
      if (!q) return true
      return (
        r.title.toLowerCase().includes(q) ||
        r.question.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        r.window.toLowerCase().includes(q)
      )
    })
  }, [category, query])

  const open = React.useCallback((report: ReportDef) => router.push(`/reports/${report.slug}`), [router])
  const { rowProps } = useListTraversal({ items: visible, onOpen: open })

  return (
    <RequireScreen screen="reports">
      <PageHeader
        title="Reports"
        crumbs={[{ label: 'FlexFit Studio', href: '/dashboard' }, { label: 'Reports' }]}
        meta={
          <>
            <span className="tnum">
              {visible.length === REPORTS.length
                ? `${num(REPORTS.length)} reports`
                : `${num(visible.length)} of ${num(REPORTS.length)} reports`}
            </span>
            <span aria-hidden>·</span>
            <span>Computed live from the current dataset</span>
            <span aria-hidden>·</span>
            <TraversalHint />
          </>
        }
        sticky={false}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterTrigger label="All" active={category === 'all'} onClick={() => setCategory('all')} />
            {REPORT_CATEGORIES.map((c) => (
              <FilterTrigger
                key={c}
                label={c}
                value={String(REPORTS.filter((r) => r.category === c).length)}
                active={category === c}
                onClick={() => setCategory(category === c ? 'all' : c)}
              />
            ))}
          </div>
          <div className="w-full max-w-64">
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              placeholder="Search reports and questions"
              aria-label="Search reports"
              className="h-7"
            />
          </div>
        </div>
      </PageHeader>

      <PageBody>
        {visible.length === 0 ? (
          <EmptyState
            icon={FileBarChart}
            title={`No report matches “${query.trim()}”`}
            description="Search covers each report's title, the question it answers, its category and the window it covers."
            action={{
              label: 'Show every report',
              onClick: () => {
                setQuery('')
                setCategory('all')
              },
            }}
          />
        ) : null}

        {REPORT_CATEGORIES.filter((c) => category === 'all' || c === category).map((cat) => {
          const rows = visible.filter((r) => r.category === cat)
          if (rows.length === 0) return null
          return (
            <Card key={cat} className="overflow-hidden">
              <CardHeader title={cat} description={`${rows.length} reports`} />
              <ul className="divide-y divide-border">
                {rows.map((report) => {
                  const index = visible.indexOf(report)
                  return (
                    <li
                      key={report.slug}
                      {...rowProps(index)}
                      className={cn(
                        'group/row transition-colors duration-150',
                        'data-[focused]:ring-1 data-[focused]:ring-inset data-[focused]:ring-primary',
                      )}
                    >
                      <Link
                        href={`/reports/${report.slug}`}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-subtle"
                      >
                        <FileBarChart aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {report.title}
                          </span>
                          <span className="block truncate text-micro text-muted-foreground">
                            {report.question}
                          </span>
                        </span>
                        <StatusChip tone="neutral" label={report.window} className="hidden sm:inline-flex" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </Card>
          )
        })}
      </PageBody>
    </RequireScreen>
  )
}
