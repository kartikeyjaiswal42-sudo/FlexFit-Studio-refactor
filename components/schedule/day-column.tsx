'use client'

import * as React from 'react'
import { GripVertical, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CapacityBar } from '@/components/ui/card'
import { StatusChip } from '@/components/ui/status-chip'
import {
  GRID_HEIGHT,
  GRID_START_HOUR,
  HOURS,
  PRESSURE_META,
  PX_PER_MIN,
  offsetFor,
  pressureFor,
  slotClock,
  snapMinutes,
  toStartTime,
  type Occurrence,
} from './schedule-engine'

/**
 * One day of the timetable, drawn to scale so a 30-minute Mobility slot reads
 * as half a Spin class without anyone reading a number.
 *
 * Reschedule is a drag, and the column is one continuous drop target snapped to
 * 15 minutes — but dragging is never the only way. Every block is also a button
 * that opens the class detail panel, which carries the same Move action for
 * keyboard and touch.
 */

export interface DragState {
  occurrence: Occurrence
  bookedCount: number
}

export function DayColumn({
  iso,
  occurrences,
  layout,
  rosterFor,
  waitlistFor,
  selectedKey,
  onSelect,
  drag,
  onDragStart,
  onDragEnd,
  onDropSlot,
  nowMinutes,
  expanded = false,
  className,
}: {
  iso: string
  occurrences: Occurrence[]
  layout: Map<string, { lane: number; lanes: number }>
  rosterFor: (occ: Occurrence) => string[]
  waitlistFor: (occ: Occurrence) => string[]
  selectedKey: string | null
  onSelect: (occ: Occurrence) => void
  drag: DragState | null
  onDragStart: (occ: Occurrence) => void
  onDragEnd: () => void
  onDropSlot: (occ: Occurrence, iso: string, startTime: string) => void
  /** Minutes from midnight for the "now" line, or null when not today. */
  nowMinutes: number | null
  expanded?: boolean
  className?: string
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [hoverMin, setHoverMin] = React.useState<number | null>(null)

  const minutesFromEvent = (clientY: number) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return GRID_START_HOUR * 60
    return snapMinutes(GRID_START_HOUR * 60 + (clientY - rect.top) / PX_PER_MIN)
  }

  return (
    <div
      ref={ref}
      className={cn('relative border-r border-border last:border-r-0', className)}
      style={{ height: GRID_HEIGHT }}
      onDragOver={(e) => {
        if (!drag) return
        e.preventDefault()
        setHoverMin(minutesFromEvent(e.clientY))
      }}
      onDragLeave={() => setHoverMin(null)}
      onDrop={(e) => {
        if (!drag) return
        e.preventDefault()
        onDropSlot(drag.occurrence, iso, toStartTime(minutesFromEvent(e.clientY)))
        setHoverMin(null)
      }}
    >
      {/* hour rules */}
      {HOURS.map((hour) => (
        <div
          key={hour}
          aria-hidden
          className="pointer-events-none absolute inset-x-0 border-t border-border/70"
          style={{ top: (hour - GRID_START_HOUR) * 60 * PX_PER_MIN }}
        />
      ))}

      {/* now line */}
      {nowMinutes !== null ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 z-20 border-t border-primary"
          style={{ top: (nowMinutes - GRID_START_HOUR * 60) * PX_PER_MIN }}
        >
          <span className="absolute -left-px -top-1 size-1.5 rounded-full bg-primary" />
        </div>
      ) : null}

      {/* drop indicator */}
      {drag && hoverMin !== null ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0.5 z-30 rounded-sm border-2 border-primary bg-primary-soft/70"
          style={{
            top: (hoverMin - GRID_START_HOUR * 60) * PX_PER_MIN,
            height: Math.max(drag.occurrence.durationMin * PX_PER_MIN, 24),
          }}
        >
          <span className="absolute left-1 top-0.5 text-micro font-medium text-accent-foreground tnum">
            {toStartTime(hoverMin)}
          </span>
        </div>
      ) : null}

      {occurrences.map((occ) => {
        const lanes = layout.get(occ.key)?.lanes ?? 1
        const lane = layout.get(occ.key)?.lane ?? 0
        /*
         * Concurrent classes tile the column — they never sit on top of each
         * other. An earlier version cascaded overlapping blocks once there were
         * three or more, so that each kept a readable width; what that actually
         * produced was three classes covering one another, with only a sliver of
         * the first two showing. The timetable is meant to be readable at a
         * glance and half of every busy morning was hidden underneath the last
         * class of the group.
         *
         * Even tiling makes the blocks narrow instead, so the WEEK grid holds a
         * minimum column width for the busiest day and scrolls sideways rather
         * than crushing them (see WeekGrid), and a block that lands narrow drops
         * to time-and-name only. Nothing is ever covered.
         */
        const step = 100 / lanes
        const left = lane * step
        const width = step
        /** Narrow enough that the capacity bar and trainer line stop fitting. */
        const tight = !expanded && lanes >= 3
        const roster = rosterFor(occ)
        const waitlist = waitlistFor(occ)
        const pressure = pressureFor(roster.length, occ.gymClass.capacity)
        const meta = PRESSURE_META[pressure]
        const height = Math.max(occ.durationMin * PX_PER_MIN, 26)
        const selected = occ.key === selectedKey
        const dragging = drag?.occurrence.key === occ.key

        return (
          <div
            key={occ.key}
            className={cn(
              'absolute px-0.5',
              selected ? 'z-20' : 'z-10 hover:z-20 focus-within:z-20',
            )}
            style={{
              top: offsetFor(occ.startTime),
              height,
              left: `${left}%`,
              width: `${width}%`,
            }}
          >
            <button
              type="button"
              draggable={occ.state !== 'past'}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', occ.key)
                onDragStart(occ)
              }}
              onDragEnd={onDragEnd}
              onClick={() => onSelect(occ)}
              aria-pressed={selected}
              /* Whatever the block is too narrow to print is still one hover
                 away, and the detail panel carries all of it on click. */
              title={`${slotClock(occ.start)} · ${occ.gymClass.name} · ${occ.trainerName} · ${roster.length}/${occ.gymClass.capacity} booked`}
              className={cn(
                'group flex h-full w-full flex-col overflow-hidden rounded-sm border px-1.5 py-1 text-left transition-colors duration-150 ease-[var(--ease-ui)]',
                'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
                occ.state === 'past'
                  ? 'border-border bg-muted text-muted-foreground'
                  : 'border-border bg-surface hover:border-border-strong',
                selected && 'border-primary bg-primary-soft ring-1 ring-primary',
                pressure === 'full' && !selected && occ.state !== 'past' && 'border-danger-border',
                dragging && 'opacity-40',
                occ.state !== 'past' && 'cursor-grab active:cursor-grabbing',
              )}
            >
              <span className={cn('flex min-w-0 gap-1', tight ? 'flex-col' : 'items-center')}>
                <span className="shrink-0 text-micro font-semibold text-foreground tnum">
                  {/* The am/pm is dropped when the block is narrow: the hour
                      gutter down the left already says which half of the day
                      this is, and those three characters are the difference
                      between a legible start time and a clipped one. */}
                  {tight ? slotClock(occ.start).replace(/(am|pm)$/, '') : slotClock(occ.start)}
                </span>
                <span
                  className={cn(
                    'min-w-0 truncate text-micro',
                    tight ? 'w-full' : 'flex-1',
                    height > 34 ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {occ.gymClass.name}
                </span>
                {occ.state !== 'past' && !tight ? (
                  <GripVertical
                    aria-hidden
                    className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                  />
                ) : null}
              </span>

              {/* Each row only appears once the block is tall enough to hold it
                  plus the rows below it. A 45-minute class clears the old 44px
                  gate but cannot fit time + trainer + capacity, so the trainer
                  line was rendering half-clipped. A tiled block in a crowded
                  hour is too NARROW for these as well — the capacity bar becomes
                  a few pixels of colour and the trainer name a single letter. */}
              {height > 58 && !tight ? (
                <span className="mt-0.5 truncate text-micro text-muted-foreground">
                  {expanded ? `${occ.trainerName} · ${occ.gymClass.type}` : occ.trainerName}
                </span>
              ) : null}

              {height > 34 && !tight ? (
                <span className="mt-auto flex items-center gap-1.5">
                  <CapacityBar
                    filled={roster.length}
                    capacity={occ.gymClass.capacity}
                    className="min-w-0 flex-1"
                  />
                  <span className="shrink-0 text-micro text-muted-foreground tnum">
                    {roster.length}/{occ.gymClass.capacity}
                  </span>
                </span>
              ) : null}

              {expanded && height > 88 ? (
                <span className="mt-1 flex flex-wrap items-center gap-1">
                  <StatusChip tone={meta.tone} label={meta.label} />
                  {waitlist.length > 0 ? (
                    <StatusChip tone="info" label={`${waitlist.length} waiting`} />
                  ) : null}
                  {occ.moved ? <StatusChip tone="warn" label="Moved" /> : null}
                </span>
              ) : null}
            </button>
          </div>
        )
      })}

      {occurrences.length === 0 ? (
        <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-2 text-center text-micro text-muted-foreground">
          {expanded ? 'Nothing on the timetable' : ''}
        </p>
      ) : null}
    </div>
  )
}

/** Time gutter shared by the week grid and the day view. */
export function TimeGutter({ className }: { className?: string }) {
  return (
    <div className={cn('relative', className)} style={{ height: GRID_HEIGHT }}>
      {HOURS.map((hour) => (
        <span
          key={hour}
          className="absolute right-1.5 -translate-y-1/2 text-micro text-muted-foreground tnum"
          style={{ top: (hour - GRID_START_HOUR) * 60 * PX_PER_MIN }}
        >
          {hour % 12 === 0 ? 12 : hour % 12}
          {hour < 12 ? 'am' : 'pm'}
        </span>
      ))}
    </div>
  )
}

/** Per-day summary strip used above each column in the week grid. */
export function DayHeadCount({
  occurrences,
  rosterFor,
}: {
  occurrences: Occurrence[]
  rosterFor: (occ: Occurrence) => string[]
}) {
  const booked = occurrences.reduce((sum, occ) => sum + rosterFor(occ).length, 0)
  const seats = occurrences.reduce((sum, occ) => sum + occ.gymClass.capacity, 0)
  if (occurrences.length === 0) {
    return <span className="text-micro text-muted-foreground">No classes</span>
  }
  return (
    <span className="flex items-center gap-1 text-micro text-muted-foreground tnum">
      <Users aria-hidden className="size-3" />
      {booked}/{seats}
    </span>
  )
}
