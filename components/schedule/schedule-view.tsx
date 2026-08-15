'use client'

import * as React from 'react'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  History,
  Undo2,
  UserPlus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ID, Member } from '@/lib/types'
import { locations } from '@/lib/data/index'
import { activeTrainers } from '@/lib/data/staff'
import { NOW, addDays, isoDate, WEEKDAY_LABELS_FULL } from '@/lib/seed'
import { PageHeader } from '@/components/shell/page-header'
import { RequireScreen } from '@/components/shell/app-shell'
import { Popover, MenuRow } from '@/components/shell/top-bar'
import { Button, ButtonGroup } from '@/components/ui/button'
import { FilterBar, FilterChip, FilterTrigger, type FilterValue } from '@/components/ui/filter-chip'
import { StatusChip } from '@/components/ui/status-chip'
import { ViewToggle } from '@/components/ui/tabs'
import { Sheet } from '@/components/ui/modal'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/components/ui/toast'
import { api } from '@/lib/api/client'
import { useStudio } from '@/lib/store/studio-store'
import {
  BookClassDialog,
  CancelBookingDialog,
  RescheduleBookingDialog,
} from '@/components/booking/booking-dialogs'
import { ClassDetail } from './class-detail'
import { RecurrenceScopeDialog } from './recurrence-dialog'
import { WeekGrid, DayView } from './week-grid'
import type { DragState } from './day-column'
import { useScheduleSession } from './schedule-session'
import {
  CLASS_TYPES,
  EMPTY_FILTERS,
  THIS_WEEK,
  conflictsForMove,
  occurrenceStart,
  slotClock,
  slotDate,
  weekDates,
  weekOccurrences,
  weekOffset,
  type Occurrence,
  type RecurrenceScope,
  type ScheduleFilters,
} from './schedule-engine'

/**
 * Schedule. The week is the default because the question staff ask is "what is
 * the shape of this week", not "what is at 6:30". Capacity pressure is legible
 * from the grid itself; opening a class is for acting, not for reading.
 *
 * Every mutation routes through one of four dialogs so the consequence is stated
 * before it happens, and every one of them leaves an audit line in the session
 * log at the bottom of the screen.
 */

type View = 'week' | 'day'

const TODAY_ISO = isoDate(NOW)

function weekLabel(weekStart: Date): string {
  const offset = weekOffset(weekStart)
  if (offset === 0) return 'This week'
  if (offset === 1) return 'Next week'
  if (offset === -1) return 'Last week'
  const end = addDays(weekStart, 6)
  return `${slotDate(weekStart)} – ${slotDate(end)}`
}

export function ScheduleScreen() {
  const session = useScheduleSession()
  const { toast } = useToast()

  const { mutate } = useStudio()
  const [weekStart, setWeekStart] = React.useState<Date>(THIS_WEEK)
  const [view, setView] = React.useState<View>('week')
  const [dayIso, setDayIso] = React.useState<string>(TODAY_ISO)
  const [filters, setFilters] = React.useState<ScheduleFilters>(EMPTY_FILTERS)
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [logOpen, setLogOpen] = React.useState(false)

  const [drag, setDrag] = React.useState<DragState | null>(null)
  const [pendingMove, setPendingMove] = React.useState<{
    occurrence: Occurrence
    iso: string
    startTime: string
  } | null>(null)
  const [booking, setBooking] = React.useState<Occurrence | null>(null)
  const [cancelling, setCancelling] = React.useState<{ occ: Occurrence; member: Member } | null>(null)
  const [moving, setMoving] = React.useState<{ occ: Occurrence; member: Member } | null>(null)

  /* narrow screens get the day view — seven columns is not a phone layout */
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(max-width: 767px)').matches) setView('day')
  }, [])

  const occurrences = React.useMemo(
    () => weekOccurrences(weekStart, filters, session.moves),
    [weekStart, filters, session.moves],
  )

  /** Unfiltered week — conflicts must consider classes the filter is hiding. */
  const weekAll = React.useMemo(
    () => weekOccurrences(weekStart, EMPTY_FILTERS, session.moves),
    [weekStart, session.moves],
  )

  const selected = occurrences.find((o) => o.key === selectedKey) ?? null

  const days = React.useMemo(() => weekDates(weekStart), [weekStart])
  const day = days.find((d) => isoDate(d) === dayIso) ?? days[0]

  /* ---------------------------------------------------------------------- */
  /* Filters                                                                */
  /* ---------------------------------------------------------------------- */

  const chips: FilterValue[] = [
    ...filters.locations.map((id) => ({
      id: `loc-${id}`,
      field: 'Location',
      value: locations.find((l) => l.id === id)?.shortName ?? id,
    })),
    ...filters.types.map((type) => ({ id: `type-${type}`, field: 'Type', value: type })),
    ...(filters.trainerId
      ? [
          {
            id: `trainer-${filters.trainerId}`,
            field: 'Trainer',
            value: activeTrainers.find((t) => t.id === filters.trainerId)?.name ?? 'Trainer',
          },
        ]
      : []),
    ...(filters.hidePast ? [{ id: 'hide-past', field: 'Finished classes', value: 'hidden' }] : []),
  ]

  const removeChip = (id: string) => {
    setFilters((prev) => {
      if (id === 'hide-past') return { ...prev, hidePast: false }
      if (id.startsWith('loc-')) {
        return { ...prev, locations: prev.locations.filter((l) => l !== id.slice(4)) }
      }
      if (id.startsWith('type-')) {
        return { ...prev, types: prev.types.filter((t) => t !== id.slice(5)) }
      }
      return { ...prev, trainerId: null }
    })
  }

  /* ---------------------------------------------------------------------- */
  /* Selection                                                              */
  /* ---------------------------------------------------------------------- */

  const select = (occ: Occurrence) => {
    setSelectedKey(occ.key)
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
      setSheetOpen(true)
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Reschedule candidates — same discipline, next fortnight                */
  /* ---------------------------------------------------------------------- */

  const rescheduleOptions = React.useMemo(() => {
    if (!moving) return []
    const from = moving.occ
    const pool = [
      ...weekOccurrences(weekStart, EMPTY_FILTERS, session.moves),
      ...weekOccurrences(addDays(weekStart, 7), EMPTY_FILTERS, session.moves),
      ...weekOccurrences(addDays(weekStart, 14), EMPTY_FILTERS, session.moves),
    ]
    const horizon = addDays(NOW, 14).getTime()
    return pool
      .filter(
        (o) =>
          o.key !== from.key &&
          o.gymClass.type === from.gymClass.type &&
          o.state !== 'past' &&
          o.start.getTime() <= horizon,
      )
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .slice(0, 12)
  }, [moving, weekStart, session.moves])

  /* ---------------------------------------------------------------------- */
  /* Class move                                                             */
  /* ---------------------------------------------------------------------- */

  const onDropSlot = (occ: Occurrence, iso: string, startTime: string) => {
    setDrag(null)
    if (iso === occ.isoDate && startTime === occ.startTime) {
      toast({ tone: 'neutral', title: 'Nothing moved', detail: 'The class was dropped back on its own slot.' })
      return
    }
    setSelectedKey(occ.key)
    setPendingMove({ occurrence: occ, iso, startTime })
  }

  const confirmMove = (
    scope: RecurrenceScope,
    notified: number,
    iso: string,
    startTime: string,
  ) => {
    if (!pendingMove) return
    // The session owns the toast now — it reports what the server actually did
    // rather than what was asked for.
    session.moveClass(pendingMove.occurrence, iso, startTime, scope, notified)
    setPendingMove(null)
  }

  /** Revert a stored reschedule — one made before this page was opened. */
  const revertStoredMove = async (id: string, className: string) => {
    await mutate(() => api.booking.cancelMove.mutate({ id }), {
      success: () => ({ title: `${className} put back on its original slot` }),
    })
  }

  /**
   * Put a rescheduled class back.
   *
   * Reads the stored move list rather than this session's audit log — a move
   * made yesterday, or by somebody else, is just as revertible as one made a
   * minute ago now that moves are persisted.
   */
  const revertMove = (occ: Occurrence) => {
    const entry = session.log.find((e) => e.undo && e.text.startsWith(`${occ.gymClass.name} moved to`))
    if (entry?.undo) {
      entry.undo()
      session.dropLog(entry.id)
      return
    }
    const stored = session.moves.filter((m) => m.classId === occ.classId)
    const last = stored[stored.length - 1]
    if (!last) {
      toast({
        tone: 'neutral',
        title: 'Nothing to put back',
        detail: 'This slot comes from the published timetable — it has not been rescheduled.',
      })
      return
    }
    void revertStoredMove(last.id, occ.gymClass.name)
  }

  /* ---------------------------------------------------------------------- */
  /* Booking actions                                                        */
  /* ---------------------------------------------------------------------- */

  // Both of these now report what the server did, from inside the session — a
  // booking that landed on the waitlist because the class filled up in the
  // meantime must not toast "Booked into …".
  const onBookConfirm = (occ: Occurrence) => (memberId: ID, _asWaitlist: boolean) => {
    session.book(occ, memberId)
  }

  const onCancelConfirm = (occ: Occurrence) => (memberId: ID, forfeited: boolean) => {
    session.cancel(occ, memberId, forfeited)
  }

  const logCount = session.log.length

  return (
    <RequireScreen screen="schedule">
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader
          title="Schedule"
          crumbs={[{ label: 'FlexFit Studio', href: '/dashboard' }, { label: 'Schedule' }]}
          meta={
            <>
              <span>{weekLabel(weekStart)}</span>
              <span aria-hidden>·</span>
              <span className="tnum">{occurrences.length} classes</span>
              <span aria-hidden>·</span>
              <span className="tnum">
                {occurrences.reduce((sum, o) => sum + session.rosterFor(o).length, 0)} booked
              </span>
              <span aria-hidden>·</span>
              <span className="tnum">
                {occurrences.reduce((sum, o) => sum + session.waitlistFor(o).length, 0)} waiting
              </span>
            </>
          }
          sticky={false}
          actions={
            <>
              <ButtonGroup>
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label="Previous week"
                  onClick={() => setWeekStart((w) => addDays(w, -7))}
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setWeekStart(THIS_WEEK)
                    setDayIso(TODAY_ISO)
                  }}
                >
                  Today
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label="Next week"
                  onClick={() => setWeekStart((w) => addDays(w, 7))}
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </ButtonGroup>
              <Button
                variant="primary"
                size="sm"
                className="gap-1.5"
                disabled={!selected || selected.state === 'past'}
                onClick={() => selected && setBooking(selected)}
              >
                <UserPlus className="size-3.5" />
                Add booking
              </Button>
            </>
          }
        />

        <FilterBar
          filters={[]}
          resultCount={occurrences.length}
          className="shrink-0"
        >
          <ViewToggle
            items={[
              { id: 'week', label: 'Week' },
              { id: 'day', label: 'Day' },
            ]}
            value={view}
            onChange={(id) => setView(id as View)}
            className="mr-1"
          />

          {view === 'day' ? (
            <div className="mr-1 flex items-center gap-1">
              {days.map((d) => {
                const iso = isoDate(d)
                const active = iso === dayIso
                return (
                  <button
                    key={iso}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setDayIso(iso)}
                    className={cn(
                      'h-6 rounded-sm border px-1.5 text-micro tnum transition-colors duration-150',
                      active
                        ? 'border-primary bg-primary-soft text-accent-foreground'
                        : 'border-border bg-surface text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {WEEKDAY_LABELS_FULL[d.getUTCDay()].slice(0, 3)} {d.getUTCDate()}
                  </button>
                )
              })}
            </div>
          ) : null}

          <Popover
            width="w-56"
            trigger={({ toggle, open }) => (
              <FilterTrigger
                label="Location"
                value={
                  filters.locations.length === 0
                    ? 'all'
                    : filters.locations.length === 1
                      ? (locations.find((l) => l.id === filters.locations[0])?.shortName ?? '1')
                      : `${filters.locations.length} sites`
                }
                active={open || filters.locations.length > 0}
                onClick={toggle}
              />
            )}
          >
            {() => (
              <div className="py-1">
                {locations.map((location) => (
                  <MenuRow
                    key={location.id}
                    primary={location.shortName}
                    secondary={location.name}
                    selected={filters.locations.includes(location.id)}
                    onClick={() =>
                      setFilters((prev) => ({
                        ...prev,
                        locations: prev.locations.includes(location.id)
                          ? prev.locations.filter((l) => l !== location.id)
                          : [...prev.locations, location.id],
                      }))
                    }
                  />
                ))}
              </div>
            )}
          </Popover>

          <Popover
            width="w-48"
            trigger={({ toggle, open }) => (
              <FilterTrigger
                label="Type"
                value={filters.types.length === 0 ? 'all' : `${filters.types.length} selected`}
                active={open || filters.types.length > 0}
                onClick={toggle}
              />
            )}
          >
            {() => (
              <div className="py-1">
                {CLASS_TYPES.map((type) => (
                  <MenuRow
                    key={type}
                    primary={type}
                    selected={filters.types.includes(type)}
                    onClick={() =>
                      setFilters((prev) => ({
                        ...prev,
                        types: prev.types.includes(type)
                          ? prev.types.filter((t) => t !== type)
                          : [...prev.types, type],
                      }))
                    }
                  />
                ))}
              </div>
            )}
          </Popover>

          <Popover
            width="w-60"
            trigger={({ toggle, open }) => (
              <FilterTrigger
                label="Trainer"
                value={
                  filters.trainerId
                    ? (activeTrainers.find((t) => t.id === filters.trainerId)?.name.split(' ')[0] ??
                      'one')
                    : 'anyone'
                }
                active={open || Boolean(filters.trainerId)}
                onClick={toggle}
              />
            )}
          >
            {(close) => (
              <div className="py-1">
                <MenuRow
                  primary="Anyone"
                  selected={!filters.trainerId}
                  onClick={() => {
                    setFilters((prev) => ({ ...prev, trainerId: null }))
                    close()
                  }}
                />
                {activeTrainers.map((trainer) => (
                  <MenuRow
                    key={trainer.id}
                    primary={trainer.name}
                    secondary={trainer.specialties.join(' · ')}
                    selected={filters.trainerId === trainer.id}
                    onClick={() => {
                      setFilters((prev) => ({ ...prev, trainerId: trainer.id }))
                      close()
                    }}
                  />
                ))}
              </div>
            )}
          </Popover>

          <FilterTrigger
            label="Finished"
            value={filters.hidePast ? 'hidden' : 'shown'}
            active={filters.hidePast}
            onClick={() => setFilters((prev) => ({ ...prev, hidePast: !prev.hidePast }))}
          />

          {chips.length > 0 ? (
            <>
              <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />
              {chips.map((chip) => (
                <FilterChip key={chip.id} filter={chip} onRemove={removeChip} />
              ))}
              <Button
                variant="link"
                size="xs"
                className="text-micro"
                onClick={() => setFilters(EMPTY_FILTERS)}
              >
                Clear all
              </Button>
            </>
          ) : null}
        </FilterBar>

        {/* grid + detail */}
        <div className="flex min-h-0 flex-1 gap-4 p-4">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {occurrences.length === 0 ? (
              <EmptyState
                title="No classes match these filters"
                description="The timetable for this week is not empty — the filters above are hiding all of it. Clear them to see the week as it runs."
                action={{ label: 'Clear filters', onClick: () => setFilters(EMPTY_FILTERS) }}
                icon={CalendarDays}
              />
            ) : view === 'week' ? (
              <WeekGrid
                weekStart={weekStart}
                occurrences={occurrences}
                rosterFor={session.rosterFor}
                waitlistFor={session.waitlistFor}
                selectedKey={selectedKey}
                onSelect={select}
                drag={drag}
                onDragStart={(occ) =>
                  setDrag({ occurrence: occ, bookedCount: session.rosterFor(occ).length })
                }
                onDragEnd={() => setDrag(null)}
                onDropSlot={onDropSlot}
              />
            ) : (
              <DayView
                day={day}
                occurrences={occurrences}
                rosterFor={session.rosterFor}
                waitlistFor={session.waitlistFor}
                selectedKey={selectedKey}
                onSelect={select}
                drag={drag}
                onDragStart={(occ) =>
                  setDrag({ occurrence: occ, bookedCount: session.rosterFor(occ).length })
                }
                onDragEnd={() => setDrag(null)}
                onDropSlot={onDropSlot}
              />
            )}

            <p className="mt-2 shrink-0 text-micro text-muted-foreground">
              Drag a class to a new slot to reschedule it, or open it and use{' '}
              <span className="text-foreground">Move class</span> — both ask how far the change reaches
              before anything is saved.
            </p>
          </div>

          {/*
            Desktop detail rail — only while a class is selected.

            It used to hold a third of the width open for a "pick a class"
            placeholder. That was affordable when concurrent classes overlapped
            each other; now that they tile, the grid needs every pixel it can
            get, and giving it back is the difference between seeing the whole
            week and scrolling to find Friday.
          */}
          {selected ? (
            <aside className="hidden min-h-0 w-[360px] shrink-0 flex-col overflow-hidden rounded-md border border-border bg-card lg:flex xl:w-[400px]">
              <ClassDetail
                occurrence={selected}
                roster={session.rosterFor(selected)}
                waitlist={session.waitlistFor(selected)}
                onAdd={() => setBooking(selected)}
                onMoveClass={() =>
                  setPendingMove({
                    occurrence: selected,
                    iso: selected.isoDate,
                    startTime: selected.startTime,
                  })
                }
                onRevertMove={selected.moved ? () => revertMove(selected) : undefined}
                onCancelMember={(member) => setCancelling({ occ: selected, member })}
                onRescheduleMember={(member) => setMoving({ occ: selected, member })}
                onPromote={(memberId) => session.promote(selected, memberId)}
                onDropWaitlist={(memberId) => session.dropFromWaitlist(selected, memberId)}
              />
            </aside>
          ) : null}
        </div>

        {/* session audit strip */}
        {logCount > 0 ? (
          <div className="shrink-0 border-t border-border bg-surface">
            <div className="flex items-center gap-2 px-4 py-1.5">
              <Button
                variant="ghost"
                size="xs"
                className="gap-1.5"
                aria-expanded={logOpen}
                onClick={() => setLogOpen((v) => !v)}
              >
                <History className="size-3" />
                {`${logCount} change${logCount === 1 ? '' : 's'} this session`}
              </Button>
              <span className="ml-auto flex items-center gap-2">
                <span className="hidden text-micro text-muted-foreground sm:inline">
                  Demo data — nothing is written to the live timetable
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  className="gap-1.5"
                  onClick={() => {
                    session.revertAll()
                    setLogOpen(false)
                  }}
                >
                  <Undo2 className="size-3" />
                  Revert all
                </Button>
              </span>
            </div>
            {logOpen ? (
              <ul className="max-h-40 divide-y divide-border overflow-y-auto border-t border-border scrollbar-thin">
                {session.log.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-2.5 px-4 py-1.5">
                    <span className="shrink-0 text-micro text-muted-foreground tnum">
                      {slotClock(entry.at)}
                    </span>
                    <StatusChip
                      tone={entry.tone === 'info' ? 'info' : entry.tone}
                      label={
                        entry.tone === 'danger'
                          ? 'Irreversible'
                          : entry.tone === 'warn'
                            ? 'Wide reach'
                            : entry.tone === 'good'
                              ? 'Booked'
                              : 'Change'
                      }
                      className="shrink-0"
                    />
                    <span className="min-w-0 flex-1 truncate text-micro text-foreground">
                      {entry.text}
                    </span>
                    {entry.undo ? (
                      <Button
                        variant="ghost"
                        size="xs"
                        className="shrink-0"
                        onClick={() => {
                          entry.undo?.()
                          session.dropLog(entry.id)
                        }}
                      >
                        Undo
                      </Button>
                    ) : (
                      <span className="shrink-0 text-micro text-muted-foreground">
                        Manager only
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* mobile detail sheet */}
      <Sheet
        open={sheetOpen && Boolean(selected)}
        onClose={() => setSheetOpen(false)}
        title={selected ? selected.gymClass.name : 'Class'}
      >
        {selected ? (
          <div className="-m-4">
            <ClassDetail
              occurrence={selected}
              roster={session.rosterFor(selected)}
              waitlist={session.waitlistFor(selected)}
              onAdd={() => setBooking(selected)}
              onMoveClass={() =>
                setPendingMove({
                  occurrence: selected,
                  iso: selected.isoDate,
                  startTime: selected.startTime,
                })
              }
              onRevertMove={selected.moved ? () => revertMove(selected) : undefined}
              onCancelMember={(member) => setCancelling({ occ: selected, member })}
              onRescheduleMember={(member) => setMoving({ occ: selected, member })}
              onPromote={(memberId) => session.promote(selected, memberId)}
              onDropWaitlist={(memberId) => session.dropFromWaitlist(selected, memberId)}
            />
          </div>
        ) : null}
      </Sheet>

      {/* dialog family */}
      {booking ? (
        <BookClassDialog
          open
          onClose={() => setBooking(null)}
          occurrence={booking}
          roster={session.rosterFor(booking)}
          waitlist={session.waitlistFor(booking)}
          onConfirm={onBookConfirm(booking)}
        />
      ) : null}

      {cancelling ? (
        <CancelBookingDialog
          open
          onClose={() => setCancelling(null)}
          occurrence={cancelling.occ}
          member={cancelling.member}
          waitlist={session.waitlistFor(cancelling.occ)}
          onConfirm={onCancelConfirm(cancelling.occ)}
        />
      ) : null}

      {moving ? (
        <RescheduleBookingDialog
          open
          onClose={() => setMoving(null)}
          from={moving.occ}
          member={moving.member}
          options={rescheduleOptions}
          rosterFor={session.rosterFor}
          waitlistFor={session.waitlistFor}
          onConfirm={(target, asWaitlist, forfeited) =>
            session.moveBooking(moving.occ, target, moving.member.id, asWaitlist, forfeited)
          }
        />
      ) : null}

      {pendingMove ? (
        <RecurrenceScopeDialog
          open
          onClose={() => setPendingMove(null)}
          occurrence={pendingMove.occurrence}
          toIso={pendingMove.iso}
          toStartTime={pendingMove.startTime}
          bookedCount={session.rosterFor(pendingMove.occurrence).length}
          waitlistCount={session.waitlistFor(pendingMove.occurrence).length}
          conflictsFor={(iso, startTime) =>
            conflictsForMove(pendingMove.occurrence, iso, startTime, weekAll)
          }
          onConfirm={confirmMove}
        />
      ) : null}
    </RequireScreen>
  )
}
