'use client'

import * as React from 'react'
import Link from 'next/link'
import { Clock, UserPlus, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardHeader, CardBody, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { RiskScore, StatusChip } from '@/components/ui/status-chip'
import { ViewToggle } from '@/components/ui/tabs'
import {
  CellStack,
  SerialTd,
  SerialTh,
  Table,
  TableWrap,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@/components/ui/table'
import { api } from '@/lib/api/client'
import { useDataVersion, useStudio } from '@/lib/store/studio-store'
import { stateOf } from '@/lib/data/work-items'
import { compactMoney, money, num } from '@/lib/format'
import { staffById } from '@/lib/data/staff'
import {
  PLAYS,
  SNOOZE_OPTIONS,
  assignableStaff,
  interventionQueue,
  queueValue,
  snoozeDate,
  type InterventionItem,
} from './retention-data'

type Filter = 'all' | 'mine' | 'unassigned'

/** Front desk is "Marco Silveira" in the role context — st-4 in the staff set. */
const CURRENT_STAFF_ID = assignableStaff[0]?.id ?? null

/**
 * The intervention queue. Ordered by risk × value, because ordering by risk
 * alone sends staff after members who were never worth the hour. Every row
 * carries the play to run, so the queue is executable rather than informational.
 *
 * The rows themselves stay derived — a member appears here because their risk
 * and value say so, recomputed every load. What is stored is only what nobody
 * can derive: that somebody assigned it, put it off, or finished with it. Before
 * that was a table, a reload put every completed call straight back in the queue
 * and two staff could each ring the same member.
 */
export function InterventionQueue({ className }: { className?: string }) {
  const { mutate, connection, busy } = useStudio()
  const version = useDataVersion()
  const [filter, setFilter] = React.useState<Filter>('all')
  const [query, setQuery] = React.useState('')
  const [assigning, setAssigning] = React.useState<InterventionItem | null>(null)
  const [snoozing, setSnoozing] = React.useState<InterventionItem | null>(null)

  /**
   * The stored decision for a row, falling back to the generated owner when
   * nobody has touched it — an untouched row keeps whoever the data says owns
   * the relationship rather than reading as unassigned.
   */
  const resolved = React.useCallback(
    (item: InterventionItem) => stateOf(item.id, item.assigneeId),
    // stateOf reads a module-level index that hydrate() rebuilds in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  )

  const isLive = (item: InterventionItem) => resolved(item).status === 'open'

  const active = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return interventionQueue.filter((item) => {
      const s = resolved(item)
      if (s.status !== 'open') return false
      if (filter === 'mine' && s.assigneeId !== CURRENT_STAFF_ID) return false
      if (filter === 'unassigned' && s.assigneeId !== null) return false
      if (!q) return true
      // Searching the owner's name too: "what is Marco still holding?" is the
      // question this queue gets asked most after "where is this member".
      const owner = s.assigneeId ? staffById.get(s.assigneeId)?.name ?? '' : ''
      return (
        item.member.name.toLowerCase().includes(q) ||
        item.member.email.toLowerCase().includes(q) ||
        PLAYS[item.play].label.toLowerCase().includes(q) ||
        owner.toLowerCase().includes(q)
      )
    })
  }, [filter, query, resolved])

  const openCount = interventionQueue.filter(isLive).length
  const snoozedCount = interventionQueue.filter((i) => resolved(i).status === 'snoozed').length
  const doneCount = interventionQueue.filter((i) => resolved(i).status === 'done').length
  const mineCount = interventionQueue.filter(
    (i) => isLive(i) && resolved(i).assigneeId === CURRENT_STAFF_ID,
  ).length
  const unassignedCount = interventionQueue.filter(
    (i) => isLive(i) && resolved(i).assigneeId === null,
  ).length

  /** One write for all three actions — see server/trpc/routers/queue.ts. */
  const write = (
    item: InterventionItem,
    patch: { status: 'open' | 'snoozed' | 'done'; assigneeId?: string | null; snoozedUntil?: string | null; resolution?: string | null },
    success: () => { title: string; detail?: string; action?: { label: string; onClick: () => void } },
  ) => {
    if (connection !== 'live') return
    const s = resolved(item)
    return mutate(
      () =>
        api.queue.setState.mutate({
          id: item.id,
          queue: 'retention',
          status: patch.status,
          assigneeId: patch.assigneeId !== undefined ? patch.assigneeId : s.assigneeId,
          snoozedUntil: patch.snoozedUntil ?? null,
          resolution: patch.resolution ?? null,
        }),
      { success },
    )
  }

  /** Put a row back in the queue — the Undo behind every action here. */
  const reopen = (item: InterventionItem, assigneeId: string | null) => {
    void write(item, { status: 'open', assigneeId, snoozedUntil: null }, () => ({
      title: 'Back in the queue',
      detail: item.member.name,
    }))
  }

  const assign = (item: InterventionItem, staffId: string) => {
    const previous = resolved(item).assigneeId
    setAssigning(null)
    void write(item, { status: 'open', assigneeId: staffId }, () => ({
      title: `Assigned to ${staffById.get(staffId)?.name ?? 'staff'}`,
      detail: `${item.member.name} · ${PLAYS[item.play].label}`,
      action: {
        label: 'Undo',
        onClick: () => {
          void write(item, { status: 'open', assigneeId: previous }, () => ({
            title: previous ? `Back with ${staffById.get(previous)?.name ?? 'staff'}` : 'Unassigned again',
          }))
        },
      },
    }))
  }

  const snooze = (item: InterventionItem, days: number) => {
    setSnoozing(null)
    const until = snoozeDate(days)
    const previousAssignee = resolved(item).assigneeId
    void write(item, { status: 'snoozed', snoozedUntil: until }, () => ({
      title: `Snoozed ${days} day${days === 1 ? '' : 's'}`,
      detail: `${item.member.name} returns to the queue on ${until}.`,
      action: { label: 'Undo', onClick: () => reopen(item, previousAssignee) },
    }))
  }

  const complete = (item: InterventionItem) => {
    const previousAssignee = resolved(item).assigneeId
    void write(
      item,
      { status: 'done', resolution: PLAYS[item.play].label },
      () => ({
        title: 'Logged as contacted',
        detail: `${item.member.name} · ${PLAYS[item.play].label}. Outcome is measured at 60 days.`,
        action: { label: 'Undo', onClick: () => reopen(item, previousAssignee) },
      }),
    )
  }

  return (
    <Card className={className}>
      <CardHeader
        title="Intervention queue"
        description={'Ordered by risk \u00d7 monthly value. Work top-down.'}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="w-full max-w-56 sm:w-56">
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
                placeholder="Search member, play or owner"
                aria-label="Search the intervention queue"
                className="h-7"
              />
            </div>
            <ViewToggle
              value={filter}
              onChange={(v) => setFilter(v as Filter)}
              items={[
                { id: 'all', label: `All ${openCount}` },
                { id: 'mine', label: `Mine ${mineCount}` },
                { id: 'unassigned', label: `Open ${unassignedCount}` },
              ]}
            />
          </div>
        }
      />

      {active.length === 0 ? (
        <CardBody>
          <EmptyState
            title={
              query.trim()
                ? `Nobody in the queue matches “${query.trim()}”`
                : filter === 'mine'
                  ? 'Nothing assigned to you'
                  : filter === 'unassigned'
                    ? 'Every item is assigned'
                    : 'Queue is clear'
            }
            description={
              query.trim()
                ? 'Search covers the member, their email, the play and whoever owns it.'
                : filter === 'all'
                  ? 'No member above 45 is waiting on contact. Snoozed items return automatically.'
                  : 'Switch to All to see the rest of the queue.'
            }
            action={query.trim() ? { label: 'Clear the search', onClick: () => setQuery('') } : undefined}
          />
        </CardBody>
      ) : (
        <TableWrap className="max-h-[32rem]">
          <Table>
            <Thead>
              <tr>
                <SerialTh />
                <Th width={220}>Member</Th>
                <Th align="right" width={72}>
                  Risk
                </Th>
                <Th align="right" width={92}>
                  Value/mo
                </Th>
                <Th width={150}>Play</Th>
                <Th width={140}>Owner</Th>
                <Th width={110} className="hidden xl:table-cell">
                  Last contact
                </Th>
                <Th align="right" width={190}>
                  Action
                </Th>
              </tr>
            </Thead>
            <Tbody>
              {active.map((item, i) => {
                const s = resolved(item)
                const owner = s.assigneeId ? staffById.get(s.assigneeId) : null
                const play = PLAYS[item.play]
                return (
                  <Tr key={item.id}>
                    <SerialTd index={i} />
                    <Td>
                      <CellStack
                        primary={
                          <Link
                            href={`/members/${item.member.id}`}
                            className="underline-offset-2 hover:underline"
                          >
                            {item.member.name}
                          </Link>
                        }
                        secondary={item.member.risk.factors[0]?.detail ?? 'No dominant factor'}
                      />
                    </Td>
                    <Td align="right">
                      <RiskScore score={item.member.risk.score} />
                    </Td>
                    <Td align="right" className="tnum">
                      {money(item.member.metrics.monthlyValue)}
                    </Td>
                    <Td>
                      <span title={play.script} className="text-sm text-foreground">
                        {play.label}
                      </span>
                    </Td>
                    <Td>
                      {owner ? (
                        <span className="text-sm text-foreground">{owner.name}</span>
                      ) : (
                        <StatusChip tone="warn" label="Unassigned" />
                      )}
                    </Td>
                    <Td muted className="tnum hidden xl:table-cell">
                      {item.lastContactDays === null ? 'Never' : `${item.lastContactDays}d ago`}
                    </Td>
                    <Td align="right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={connection !== 'live'}
                          onClick={() => setAssigning(item)}
                        >
                          <UserPlus className="size-3" />
                          Assign
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={connection !== 'live'}
                          onClick={() => setSnoozing(item)}
                        >
                          <Clock className="size-3" />
                          Snooze
                        </Button>
                        <Button
                          size="xs"
                          variant="secondary"
                          disabled={busy || connection !== 'live'}
                          onClick={() => complete(item)}
                        >
                          <Check className="size-3" />
                          Done
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                )
              })}
            </Tbody>
          </Table>
        </TableWrap>
      )}

      <CardFooter>
        <span className="tnum">
          {num(active.length)} in queue · {compactMoney(queueValue(active))}/mo at stake
        </span>
        <span className="tnum">
          {num(doneCount)} contacted · {num(snoozedCount)} snoozed
        </span>
      </CardFooter>

      <Modal
        open={assigning !== null}
        onClose={() => setAssigning(null)}
        title="Assign intervention"
        description={
          assigning
            ? `${assigning.member.name} · ${PLAYS[assigning.play].label} · risk ${assigning.member.risk.score}`
            : undefined
        }
        size="sm"
      >
        {assigning ? (
          <div className="space-y-3">
            <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm leading-relaxed text-muted-foreground">
              {PLAYS[assigning.play].script}
            </p>
            <ul className="flex flex-col gap-1">
              {assignableStaff.map((person) => (
                <li key={person.id}>
                  <button
                    type="button"
                    onClick={() => assign(assigning, person.id)}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-sm border border-border bg-surface px-2.5 py-2 text-left',
                      'transition-colors duration-150 hover:border-border-strong hover:bg-muted',
                      'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {person.name}
                      </span>
                      <span className="block truncate text-micro text-muted-foreground capitalize">
                        {person.role.replace('-', ' ')}
                      </span>
                    </span>
                    {resolved(assigning).assigneeId === person.id ? (
                      <StatusChip tone="info" label="Current" />
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={snoozing !== null}
        onClose={() => setSnoozing(null)}
        title="Snooze intervention"
        description={
          snoozing ? `${snoozing.member.name} returns to the queue automatically.` : undefined
        }
        size="sm"
        footer={
          <Button variant="secondary" onClick={() => setSnoozing(null)}>
            Cancel
          </Button>
        }
      >
        {snoozing ? (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Snoozing hides the row — it does not lower the risk score. If the member keeps
              declining they will re-enter above their current position.
            </p>
            <div className="flex gap-2">
              {SNOOZE_OPTIONS.map((option) => (
                <Button
                  key={option.days}
                  variant="secondary"
                  size="sm"
                  onClick={() => snooze(snoozing, option.days)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
      </Modal>
    </Card>
  )
}
