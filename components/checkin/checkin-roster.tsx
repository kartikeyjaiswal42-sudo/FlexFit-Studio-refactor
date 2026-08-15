'use client'

import * as React from 'react'
import Link from 'next/link'
import { CalendarDays, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GymClass, ID } from '@/lib/types'
import { memberById } from '@/lib/data/members'
import { clock } from '@/lib/format'
import { NOW } from '@/lib/seed'
import { Card, CardHeader } from '@/components/ui/card'
import { CapacityBar } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusChip } from '@/components/ui/status-chip'
import { todaysClasses, trainerName, classStart } from '../kiosk/kiosk-engine'

/**
 * Today's classes with arrival tracking.
 *
 * The number that matters is "expected but not here yet", so it is the one
 * rendered as a chip. A roster that only shows bookings tells the trainer
 * nothing they didn't already know at 6am.
 */
export function CheckinRoster({ arrived }: { arrived: Set<ID> }) {
  const classes = React.useMemo(() => todaysClasses(), [])
  const [openId, setOpenId] = React.useState<string | null>(classes[0]?.id ?? null)

  const nowMin = NOW.getUTCHours() * 60 + NOW.getUTCMinutes()

  return (
    <Card className="flex min-h-0 flex-col">
      <CardHeader
        title="Today's classes"
        description={`${classes.length} sessions scheduled · Friday 14 Aug`}
      />

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {classes.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={CalendarDays}
              title="No classes today"
              description="Nothing is on the timetable for today. The floor is open for general access only."
            />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {classes.map((c) => (
              <RosterRow
                key={c.id}
                gymClass={c}
                arrived={arrived}
                nowMin={nowMin}
                open={openId === c.id}
                onToggle={() => setOpenId((id) => (id === c.id ? null : c.id))}
              />
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}

function RosterRow({
  gymClass: c,
  arrived,
  nowMin,
  open,
  onToggle,
}: {
  gymClass: GymClass
  arrived: Set<ID>
  nowMin: number
  open: boolean
  onToggle: () => void
}) {
  const [h, m] = c.startTime.split(':').map(Number)
  const startMin = h * 60 + m
  const endMin = startMin + c.durationMin

  const here = c.roster.filter((id) => arrived.has(id))
  const pending = c.roster.filter((id) => !arrived.has(id))

  const state: 'done' | 'now' | 'soon' =
    nowMin >= endMin ? 'done' : nowMin >= startMin ? 'now' : 'soon'

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150 hover:bg-subtle"
      >
        <span className="w-14 shrink-0 text-sm font-medium text-foreground tnum">
          {clock(classStart(c.startTime))}
        </span>

        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-sm font-medium text-foreground">{c.name}</span>
          <span className="truncate text-micro text-muted-foreground">
            {trainerName(c.trainerId)}
            {' · '}
            {c.durationMin} min
          </span>
        </span>

        <span className="hidden w-28 shrink-0 sm:block">
          <CapacityBar filled={c.roster.length} capacity={c.capacity} showLabel />
        </span>

        {state === 'now' ? (
          <StatusChip tone="info" label="In session" className="shrink-0" />
        ) : state === 'done' ? (
          <StatusChip tone="neutral" label="Finished" className="shrink-0" />
        ) : pending.length > 0 ? (
          <StatusChip
            tone={pending.length > c.roster.length * 0.6 ? 'warn' : 'neutral'}
            label={`${pending.length} not here`}
            className="shrink-0"
          />
        ) : (
          <StatusChip tone="good" label="All arrived" className="shrink-0" />
        )}

        <ChevronDown
          aria-hidden
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground transition-transform duration-150',
            open && 'rotate-180',
          )}
        />
      </button>

      {open ? (
        <div className="border-t border-border bg-subtle px-4 py-3">
          {/* The names on the collapsed row are inside its toggle button, so
              they cannot be links — nesting an anchor in a button is invalid and
              the anchor stops being reachable. The clickable versions live here
              instead: the trainer, and every member below. */}
          <p className="mb-2.5 text-micro text-muted-foreground">
            Led by{' '}
            <Link
              href={`/trainers/${c.trainerId}`}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              {trainerName(c.trainerId)}
            </Link>
            {' · '}
            {c.durationMin} min · {c.roster.length}/{c.capacity} booked
          </p>

          {c.waitlist.length > 0 ? (
            <p className="mb-2.5 rounded-sm border border-info-border bg-info-soft px-2 py-1.5 text-micro text-info">
              {`Full · ${c.waitlist.length} on the waitlist. If someone no-shows by ${clock(classStart(c.startTime))}, offer the spot to position 1.`}
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <RosterGroup
              title={`Arrived · ${here.length}`}
              ids={here}
              tone="good"
              empty="Nobody has checked in for this class yet."
            />
            <RosterGroup
              title={`Expected · ${pending.length}`}
              ids={pending}
              tone="neutral"
              empty="Everyone booked has arrived."
            />
          </div>
        </div>
      ) : null}
    </li>
  )
}

function RosterGroup({
  title,
  ids,
  tone,
  empty,
}: {
  title: string
  ids: ID[]
  tone: 'good' | 'neutral'
  empty: string
}) {
  return (
    <div>
      <p className="text-micro font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </p>
      {ids.length === 0 ? (
        <p className="mt-1 text-micro text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-1.5 flex flex-wrap gap-1">
          {ids.slice(0, 12).map((id) => {
            const m = memberById.get(id)
            if (!m) return null
            return (
              <li key={id}>
                <Link
                  href={`/members/${id}`}
                  className={cn(
                    'inline-flex items-center rounded-sm border px-1.5 py-0.5 text-micro transition-colors',
                    tone === 'good'
                      ? 'border-good-border bg-good-soft text-good hover:border-good'
                      : 'border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground',
                  )}
                >
                  {m.name}
                </Link>
              </li>
            )
          })}
          {ids.length > 12 ? (
            <li className="inline-flex items-center px-1 text-micro text-muted-foreground">
              {`+${ids.length - 12} more`}
            </li>
          ) : null}
        </ul>
      )}
    </div>
  )
}
