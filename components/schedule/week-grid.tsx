'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { isoDate, NOW, WEEKDAY_LABELS } from '@/lib/seed'
import { StatusChip } from '@/components/ui/status-chip'
import { CapacityBar } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { DayColumn, DayHeadCount, TimeGutter, type DragState } from './day-column'
import {
  PRESSURE_META,
  layoutDay,
  occurrencesOnDay,
  pressureFor,
  slotClock,
  weekDates,
  type Occurrence,
} from './schedule-engine'

const TODAY_ISO = isoDate(NOW)
const NOW_MINUTES = NOW.getUTCHours() * 60 + NOW.getUTCMinutes()

interface SharedProps {
  occurrences: Occurrence[]
  rosterFor: (occ: Occurrence) => string[]
  waitlistFor: (occ: Occurrence) => string[]
  selectedKey: string | null
  onSelect: (occ: Occurrence) => void
  drag: DragState | null
  onDragStart: (occ: Occurrence) => void
  onDragEnd: () => void
  onDropSlot: (occ: Occurrence, iso: string, startTime: string) => void
}

/**
 * The week. Seven columns to scale, one scroll region, capacity pressure
 * readable at a glance from the bar in every block.
 */
/** Width one column needs so `lanes` tiled blocks each stay readable. */
const PX_PER_LANE = 46
const MIN_DAY_WIDTH = 116
const GUTTER_WIDTH = 44

export function WeekGrid({
  weekStart,
  occurrences,
  rosterFor,
  waitlistFor,
  selectedKey,
  onSelect,
  drag,
  onDragStart,
  onDragEnd,
  onDropSlot,
}: SharedProps & { weekStart: Date }) {
  const days = React.useMemo(() => weekDates(weekStart), [weekStart])

  /**
   * Lay every day out once, then size the grid to the busiest of them.
   *
   * Concurrent classes tile rather than overlap (see DayColumn), so on a morning
   * with three classes at 07:30 each block gets a third of the column. At seven
   * columns in a laptop-width pane that is around 45px — enough for the start
   * time and a truncated name, and not enough for anything else. Rather than
   * shrink below that, the grid takes a minimum width and scrolls sideways: a
   * class you have to scroll to reach is still better than one hidden behind
   * another.
   */
  const layouts = React.useMemo(
    () =>
      days.map((day) => {
        const iso = isoDate(day)
        const dayOccurrences = occurrencesOnDay(occurrences, iso)
        return { iso, dayOccurrences, layout: layoutDay(dayOccurrences) }
      }),
    [days, occurrences],
  )

  /**
   * Each day is sized for ITS OWN busiest hour, not the week's.
   *
   * Sizing all seven to the worst day made a single four-class morning widen
   * every column, which pushed Sunday off the edge of a laptop screen to buy
   * room a day with two classes never needed. Per-day minimums usually let the
   * whole week fit; when they genuinely cannot, the scroll is carrying real
   * classes rather than empty space.
   */
  const dayMinimums = React.useMemo(
    () =>
      layouts.map((d) => {
        const lanes = Math.max(1, ...Array.from(d.layout.values(), (v) => v.lanes))
        return Math.max(MIN_DAY_WIDTH, lanes * PX_PER_LANE)
      }),
    [layouts],
  )

  const minWidth = GUTTER_WIDTH + dayMinimums.reduce((sum, w) => sum + w, 0)
  const columns = `${GUTTER_WIDTH}px ${dayMinimums.map((w) => `minmax(${w}px, 1fr)`).join(' ')}`

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-card">
      {/*
        One scroller for the heads and the body together. They used to be two,
        which was fine while the grid could never be wider than its pane — now
        that it can be, a split scroller would slide the columns out from under
        their own dates. The head row stays put vertically by being sticky.
      */}
      <div className="min-h-0 flex-1 overflow-auto scrollbar-thin">
        <div style={{ minWidth }}>
          {/* day heads */}
          <div
            className="sticky top-0 z-30 grid border-b border-border bg-subtle"
            style={{ gridTemplateColumns: columns }}
          >
            <div aria-hidden />
            {layouts.map(({ iso, dayOccurrences }, i) => {
              const day = days[i]
              const today = iso === TODAY_ISO
              return (
                <div
                  key={iso}
                  className={cn(
                    'flex min-w-0 flex-col gap-0.5 border-l border-border px-2 py-1.5',
                    today && 'bg-primary-soft',
                  )}
                >
                  <span className="flex items-baseline gap-1">
                    <span
                      className={cn(
                        'text-micro font-medium tracking-wide uppercase',
                        today ? 'text-accent-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {WEEKDAY_LABELS[day.getUTCDay()]}
                    </span>
                    <span
                      className={cn(
                        'text-sm font-semibold tnum',
                        today ? 'text-accent-foreground' : 'text-foreground',
                      )}
                    >
                      {day.getUTCDate()}
                    </span>
                  </span>
                  <DayHeadCount occurrences={dayOccurrences} rosterFor={rosterFor} />
                </div>
              )
            })}
          </div>

          <div className="grid" style={{ gridTemplateColumns: columns }}>
            <TimeGutter className="border-r border-border" />
            {layouts.map(({ iso, dayOccurrences, layout }) => (
              <DayColumn
                key={iso}
                iso={iso}
                occurrences={dayOccurrences}
                layout={layout}
                rosterFor={rosterFor}
                waitlistFor={waitlistFor}
                selectedKey={selectedKey}
                onSelect={onSelect}
                drag={drag}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDropSlot={onDropSlot}
                nowMinutes={iso === TODAY_ISO ? NOW_MINUTES : null}
                className={iso === TODAY_ISO ? 'bg-primary-soft/25' : undefined}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * One day, wide. The same column component at full width plus a roster-level
 * list underneath, because on a single day there is room to answer "who is in
 * this class" without opening anything.
 */
export function DayView({
  day,
  occurrences,
  rosterFor,
  waitlistFor,
  selectedKey,
  onSelect,
  drag,
  onDragStart,
  onDragEnd,
  onDropSlot,
}: SharedProps & { day: Date }) {
  const iso = isoDate(day)
  const dayOccurrences = occurrencesOnDay(occurrences, iso)
  const layout = React.useMemo(() => layoutDay(dayOccurrences), [dayOccurrences])

  return (
    // Stacked (below lg) this wrapper is the scroller, so the grid cannot use
    // flex-1 — inside an auto-height scroll parent that collapses to almost
    // nothing and clips the timeline. Stacked, the grid takes a fixed readable
    // height and the roster list flows beneath it; side by side on lg, the
    // wrapper stops scrolling and the grid fills the pane again.
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto scrollbar-thin lg:flex-row lg:overflow-hidden">
      <div className="flex h-[28rem] shrink-0 overflow-hidden rounded-md border border-border bg-card lg:h-auto lg:min-h-0 lg:flex-1">
        <div className="min-h-0 flex-1 overflow-auto scrollbar-thin">
          <div className="grid grid-cols-[44px_minmax(0,1fr)]">
            <TimeGutter className="border-r border-border" />
            <DayColumn
              iso={iso}
              occurrences={dayOccurrences}
              layout={layout}
              rosterFor={rosterFor}
              waitlistFor={waitlistFor}
              selectedKey={selectedKey}
              onSelect={onSelect}
              drag={drag}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDropSlot={onDropSlot}
              nowMinutes={iso === TODAY_ISO ? NOW_MINUTES : null}
              expanded
            />
          </div>
        </div>
      </div>

      <div className="shrink-0 rounded-md border border-border bg-card lg:w-80">
        <p className="border-b border-border bg-subtle px-3 py-1.5 text-micro font-medium tracking-wide text-muted-foreground uppercase">
          {`${dayOccurrences.length} classes`}
        </p>
        {dayOccurrences.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="Nothing scheduled"
              description="No classes run on this day. The floor is open for general access only."
            />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {dayOccurrences.map((occ) => {
              const roster = rosterFor(occ)
              const waitlist = waitlistFor(occ)
              const meta = PRESSURE_META[pressureFor(roster.length, occ.gymClass.capacity)]
              return (
                <li key={occ.key}>
                  <button
                    type="button"
                    onClick={() => onSelect(occ)}
                    aria-pressed={occ.key === selectedKey}
                    className={cn(
                      'flex w-full flex-col gap-1 px-3 py-2 text-left transition-colors duration-150',
                      occ.key === selectedKey ? 'bg-primary-soft' : 'hover:bg-subtle',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-14 shrink-0 text-sm font-medium text-foreground tnum">
                        {slotClock(occ.start)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                        {occ.gymClass.name}
                      </span>
                      <StatusChip tone={meta.tone} label={meta.label} className="shrink-0" />
                    </span>
                    <span className="flex items-center gap-2 pl-16">
                      <CapacityBar
                        filled={roster.length}
                        capacity={occ.gymClass.capacity}
                        className="min-w-0 flex-1"
                        showLabel
                      />
                      {waitlist.length > 0 ? (
                        <span className="shrink-0 text-micro text-info tnum">
                          +{waitlist.length} waiting
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
