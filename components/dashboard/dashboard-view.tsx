'use client'

import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PageHeader, PageBody } from '@/components/shell/page-header'
import { RequireScreen } from '@/components/shell/app-shell'
import { useApp } from '@/components/shell/role-context'
import { compactMoney, fullDate, num } from '@/lib/format'
import { NOW } from '@/lib/seed'
import { AttentionQueue, AttentionProvider, useAttention } from './attention-queue'
import { KpiStrip } from './kpi-strip'
import { RevenueChart } from './revenue-chart'
import { AttendanceHeatmap } from './attendance-heatmap'
import { CohortTriangle } from './cohort-triangle'
import { mrr } from './dashboard-data'

/**
 * Owner dashboard. Order is the argument: what needs you, then the six numbers
 * that prove it, then the three views that explain where those numbers came
 * from. Work first, reporting second.
 */
export function DashboardView() {
  return (
    <AttentionProvider>
      <DashboardScreen />
    </AttentionProvider>
  )
}

function DashboardScreen() {
  const { location, roleMeta } = useApp()
  // Same source as the queue below, so clearing an item moves both.
  const { criticalCount, valueAtStake } = useAttention()

  return (
    <RequireScreen screen="dashboard">
      <PageHeader
        title={`Good morning, ${roleMeta.person.split(' ')[0]}`}
        crumbs={[{ label: 'FlexFit Studio' }, { label: 'Dashboard' }]}
        meta={
          <>
            <span>{fullDate(NOW)}</span>
            <span aria-hidden>·</span>
            <span>{location.name}</span>
            <span aria-hidden>·</span>
            <span className="tnum">{compactMoney(mrr)}/mo recurring</span>
            <span aria-hidden>·</span>
            {/* The queue now lives at the foot of a long page, so its count
                doubles as the jump link to it. */}
            <a href="#needs-attention" className="tnum underline-offset-2 hover:underline">
              {num(criticalCount)} to act on · {compactMoney(valueAtStake)}/mo at stake
            </a>
          </>
        }
        actions={
          <>
            <Link
              href="/reports"
              className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'hidden sm:inline-flex')}
            >
              Reports
            </Link>
            <Link href="/retention" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
              Review retention
            </Link>
          </>
        }
        sticky={false}
      />

      <PageBody>
        <KpiStrip />

        <RevenueChart />

        {/* items-start so the shorter card keeps its own height instead of
            stretching to match its neighbour and leaving dead space. */}
        <div className="grid items-start gap-4 xl:grid-cols-2">
          <AttendanceHeatmap />
          <CohortTriangle />
        </div>

        {/*
          The ranked work queue sits at the foot of the page by request. It used
          to open the screen, which put a full screenful of tasks between the
          owner and any number at all. The page header still carries its count
          and links down to it, so moving it does not hide that work is waiting.
        */}
        <section id="needs-attention" className="scroll-mt-6">
          <AttentionQueue />
        </section>
      </PageBody>
    </RequireScreen>
  )
}
