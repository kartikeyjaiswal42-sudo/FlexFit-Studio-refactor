'use client'

import * as React from 'react'
import Link from 'next/link'
import { Download, Mail, Printer } from 'lucide-react'
import { PageHeader, PageBody } from '@/components/shell/page-header'
import { RequireScreen } from '@/components/shell/app-shell'
import { Card, CardHeader, CardFooter, KpiTile } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState, NullResultState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import {
  SerialTd,
  SerialTh,
  Table,
  TableWrap,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  type SortDir,
} from '@/components/ui/table'
import { ComposeEmailDialog } from '@/components/comms/compose-email-dialog'
import { api } from '@/lib/api/client'
import { useDataVersion, useStudio } from '@/lib/store/studio-store'
import { datedFilename, downloadCsv } from '@/lib/export'
import { cn } from '@/lib/utils'
import { fullDate, num } from '@/lib/format'
import { NOW } from '@/lib/seed'
import type { CellTone } from './reports-data'
import { getReport, reportRecipients } from './reports-data'
import { ReportChart } from './report-chart'
import { classifyColumns, filterRows, sortRows, summarise } from './report-analysis'

const TONE_CLASS: Record<CellTone, string> = {
  default: '',
  good: 'text-good',
  warn: 'text-warn',
  danger: 'text-danger',
  muted: 'text-muted-foreground',
}

/**
 * One report. The takeaway sits above the table, because the number is not the
 * product — the decision is. Where the data can't support a conclusion the
 * caveat is rendered as a null result, not hidden in a footnote.
 */
export function ReportView({ slug }: { slug: string }) {
  const { connection } = useStudio()
  const version = useDataVersion()
  const [emailOpen, setEmailOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [sort, setSort] = React.useState<{ index: number; dir: 'asc' | 'desc' } | null>(null)
  const report = getReport(slug)
  const result = React.useMemo(() => report?.run(), [report, version])
  // Recipients are recomputed on hydrate, so a manager who left stops receiving
  // reports without anybody remembering to take them off a list.
  const recipient = React.useMemo(() => reportRecipients[0] ?? null, [version])

  /**
   * What each column actually holds, read back off the rendered cells. This is
   * what lets one generic screen sort, total and chart twelve different reports
   * without any of them having to declare a schema — see report-analysis.ts.
   */
  const kinds = React.useMemo(
    () => (result ? classifyColumns(result.columns, result.rows) : []),
    [result],
  )

  /** Search first, then sort: sorting a filtered list is the cheaper order. */
  const rows = React.useMemo(() => {
    if (!result) return []
    const found = filterRows(result.rows, query)
    if (!sort) return found
    return sortRows(found, sort.index, sort.dir, kinds[sort.index] ?? 'label')
  }, [result, query, sort, kinds])

  const summary = React.useMemo(
    () => (result ? summarise(result.columns, rows, kinds) : []),
    [result, rows, kinds],
  )

  // Changing report resets the reader's view of it; leaving a sort or a search
  // applied across a navigation makes the next report look like it has fewer
  // rows than it does.
  React.useEffect(() => {
    setQuery('')
    setSort(null)
  }, [slug])

  if (!report || !result) return null

  const toggleSort = (index: number) =>
    setSort((prev) =>
      prev?.index === index
        ? prev.dir === 'desc'
          ? { index, dir: 'asc' }
          : null // third click clears — back to the report's own order
        : { index, dir: 'desc' },
    )
  const dirFor = (index: number): SortDir => (sort?.index === index ? sort.dir : null)

  /**
   * The rows as rendered, in the order rendered — including any search and sort
   * the reader applied, so the file matches the screen it was taken from. A
   * report is a question with an answer attached, so the file carries the
   * takeaway and the caveat as header lines: a spreadsheet of numbers with the
   * honest caveat stripped off is how a null result gets quoted as a finding.
   */
  const exportCsv = () =>
    downloadCsv(
      datedFilename(report.slug),
      rows,
      [
        { header: 'S.no', value: (_r, i) => i + 1 },
        ...result.columns.map((c, i) => ({
          header: c.label,
          value: (r: (typeof result.rows)[number]) => r.cells[i] ?? '',
        })),
      ],
    )

  return (
    <RequireScreen screen="reports">
      <PageHeader
        title={report.title}
        crumbs={[
          { label: 'FlexFit Studio', href: '/dashboard' },
          { label: 'Reports', href: '/reports' },
          { label: report.title },
        ]}
        meta={
          <>
            <span>{report.category}</span>
            <span aria-hidden>·</span>
            <span>{report.window}</span>
            <span aria-hidden>·</span>
            <span className="tnum">Run {fullDate(NOW)}</span>
          </>
        }
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={exportCsv}>
              <Download />
              CSV
            </Button>
            {/* The print stylesheet drops the shell, so this puts the report on
                paper as the reader has it — takeaway, caveat and all. */}
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <Printer />
              Print
            </Button>
            {/* Not "Schedule": nothing in this app runs on a timer, and a button
                that promises a 7am Monday email would be promising something no
                code performs. Sending it now is the part that is real. */}
            <Button
              variant="secondary"
              size="sm"
              disabled={!recipient || connection !== 'live'}
              title={recipient ? undefined : 'No active owner or manager to send this to.'}
              onClick={() => setEmailOpen(true)}
            >
              <Mail />
              Email this
            </Button>
          </>
        }
        sticky={false}
      />

      <PageBody>
        <div className="rounded-md border border-border bg-card px-4 py-3">
          <p className="text-micro font-medium tracking-wide text-muted-foreground uppercase">
            {report.question}
          </p>
          <p className="mt-1 max-w-prose text-base leading-relaxed text-foreground text-pretty">
            {result.takeaway}
          </p>
        </div>

        {result.caveat ? (
          <NullResultState title="Read this with the sample size in mind" description={result.caveat} />
        ) : null}

        {/*
          The report's own numbers, summarised. Every tile here is computed from
          the rows currently shown, so narrowing the table with the search box
          narrows these too — a total that ignored the filter above it would be
          answering a question nobody asked.
        */}
        {summary.length > 0 ? (
          <Card className="grid grid-cols-2 lg:grid-cols-4">
            <KpiTile
              label="Rows"
              value={num(rows.length)}
              footnote={
                rows.length === result.rows.length
                  ? 'The whole result'
                  : `Filtered from ${num(result.rows.length)}`
              }
            />
            {summary.slice(0, 3).map((col) => (
              <KpiTile
                key={col.index}
                label={col.label}
                value={col.formatted.total ?? col.formatted.average}
                footnote={
                  col.formatted.total
                    ? `Average ${col.formatted.average} · highest ${col.formatted.max}${col.maxRow ? ` (${col.maxRow})` : ''}`
                    : /* Percentages get an average, never a total — see summarise(). */
                      `Average across rows · highest ${col.formatted.max}${col.maxRow ? ` (${col.maxRow})` : ''}`
                }
              />
            ))}
          </Card>
        ) : null}

        <ReportChart columns={result.columns} rows={rows} kinds={kinds} />

        <Card className="overflow-hidden">
          <CardHeader
            title="Result"
            description={
              rows.length === result.rows.length
                ? `${result.rows.length} rows · every figure derives from the live dataset`
                : `${rows.length} of ${result.rows.length} rows shown`
            }
            actions={
              <div className="flex items-center gap-2">
                {sort ? (
                  <Button variant="ghost" size="sm" onClick={() => setSort(null)}>
                    Clear sort
                  </Button>
                ) : null}
                <div className="w-44 sm:w-56">
                  <Input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.currentTarget.value)}
                    placeholder="Search this report"
                    aria-label="Search rows in this report"
                    className="h-7"
                  />
                </div>
              </div>
            }
          />
          {rows.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title={`No row matches “${query.trim()}”`}
                description="Search looks at every cell in the table, not just the first column."
                action={{ label: 'Clear the search', onClick: () => setQuery('') }}
              />
            </div>
          ) : (
            <TableWrap>
              <Table>
                <Thead>
                  <tr>
                    <SerialTh />
                    {result.columns.map((col, i) => (
                      <Th
                        key={col.key}
                        align={col.align ?? 'left'}
                        sortable
                        sortDir={dirFor(i)}
                        onSort={() => toggleSort(i)}
                      >
                        {col.label}
                      </Th>
                    ))}
                  </tr>
                </Thead>
                <Tbody>
                  {rows.map((row, i) => (
                    <Tr key={i}>
                      <SerialTd index={i} />
                      {row.cells.map((cell, j) => (
                        <Td
                          key={j}
                          align={result.columns[j]?.align ?? 'left'}
                          className={cn(
                            j === 0 ? 'font-medium text-foreground' : 'tnum',
                            j > 0 && TONE_CLASS[row.tone ?? 'default'],
                          )}
                        >
                          {cell}
                        </Td>
                      ))}
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableWrap>
          )}
          <CardFooter>
            <span>
              Figures are recomputed on every load — there is no cached snapshot.
              {sort ? ' Sorted by your choice of column, not the report’s own order.' : ''}
            </span>
            <Link href="/reports" className="font-medium text-primary underline-offset-2 hover:underline">
              All reports
            </Link>
          </CardFooter>
        </Card>
      </PageBody>

      {recipient ? (
        <ComposeEmailDialog
          open={emailOpen}
          onClose={() => setEmailOpen(false)}
          to={recipient.email}
          toName={recipient.name}
          title={`Email ${report.title}`}
          send={({ subject, body }) =>
            api.comms.emailStaff.mutate({ staffId: recipient.id, subject, body })
          }
          templates={[
            {
              label: 'Summary',
              subject: `${report.title} — ${fullDate(NOW)}`,
              body: [
                `Hi ${recipient.firstName},`,
                '',
                report.question,
                '',
                result.takeaway,
                ...(result.caveat ? ['', `Caveat: ${result.caveat}`] : []),
                '',
                `Covers ${report.window}. ${result.rows.length} rows — the full table is on the Reports screen, and the CSV button beside this one downloads it.`,
                '',
                'FlexFit Studio',
              ].join('\n'),
            },
          ]}
        />
      ) : null}
    </RequireScreen>
  )
}
