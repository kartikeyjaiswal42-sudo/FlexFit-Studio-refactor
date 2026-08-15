'use client'

import * as React from 'react'
import Link from 'next/link'
import { CheckCircle2, Mail, PhoneCall, RefreshCw } from 'lucide-react'
import { PageHeader, PageBody } from '@/components/shell/page-header'
import { RequireScreen } from '@/components/shell/app-shell'
import { Card, CardBody, CardHeader, KpiTile } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { RiskScore, StatusChip } from '@/components/ui/status-chip'
import { EmptyState } from '@/components/ui/empty-state'
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
import { ComposeEmailDialog } from '@/components/comms/compose-email-dialog'
import { api } from '@/lib/api/client'
import { useDataVersion, useStudio } from '@/lib/store/studio-store'
import { stateOf } from '@/lib/data/work-items'
import { getMember } from '@/lib/data/members'
import { paymentById } from '@/lib/data/payments'
import { compactMoney, money, num, shortDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { BillingTabs } from './billing-tabs'
import { DUNNING_LADDER, dunningQueue, invoices, type DunningItem } from './billing-data'

/**
 * Dunning is a recovery ladder, not a punishment queue. Every row shows which
 * rung it is on, what happens next, and what it is worth to recover — so staff
 * can spend their calls on the invoices that matter.
 */
export function DunningQueue() {
  const { mutate, busy, connection } = useStudio()
  const version = useDataVersion()
  const all = React.useMemo(() => dunningQueue(), [version])
  const [pauseTarget, setPauseTarget] = React.useState<DunningItem | null>(null)
  const [emailTarget, setEmailTarget] = React.useState<DunningItem | null>(null)
  const [rung, setRung] = React.useState<string>('all')
  const [query, setQuery] = React.useState('')

  // A row leaves the queue because somebody dealt with it, which is a stored
  // fact — not because this component forgot about it. `work_items` holds it,
  // so the row is still gone after a reload and gone for everyone else too.
  const open = React.useMemo(
    () => all.filter((i) => stateOf(`dun-${i.invoice.id}`).status === 'open'),
    [all, version],
  )
  /**
   * Rung filter first, then the search box. Somebody chasing a specific member
   * knows their name, not which rung of the ladder they landed on — so the
   * search deliberately spans the whole open queue when no rung is selected.
   */
  const rows = React.useMemo(() => {
    const byRung = rung === 'all' ? open : open.filter((i) => i.step.id === rung)
    const q = query.trim().toLowerCase()
    if (!q) return byRung
    return byRung.filter(
      (i) =>
        i.invoice.memberName.toLowerCase().includes(q) ||
        i.invoice.id.toLowerCase().includes(q) ||
        i.invoice.planName.toLowerCase().includes(q),
    )
  }, [open, rung, query])
  const atStake = open.reduce((s, i) => s + i.invoice.amount, 0)
  const recoverable = open.reduce((s, i) => s + i.monthlyValue, 0)

  /**
   * Every rung does two writes: the action itself (a retry attempt, a call
   * logged, access actually paused) and the note that this row has been
   * handled. They are separate on purpose — pausing access changes the member,
   * whereas "handled" is a fact about the queue, and conflating them is how the
   * queue ends up disagreeing with the membership.
   */
  const act = async (
    item: DunningItem,
    action: 'retry' | 'called' | 'access-paused',
    label: string,
    detail: string,
  ) => {
    await mutate(
      async () => {
        if (action === 'retry') {
          // `retry` reattempts a specific failed payment row, not an invoice —
          // the ladder counts attempts per invoice, so the row is what carries
          // the attempt number. Take the most recent failure on this invoice.
          const failed = [...item.invoice.paymentIds]
            .map((id) => paymentById.get(id))
            .filter((p): p is NonNullable<typeof p> => Boolean(p) && p!.status === 'failed')
            .sort((a, b) => (a.date < b.date ? 1 : -1))[0]
          if (!failed) throw new Error('No failed payment on this invoice to retry.')
          await api.billing.retry.mutate({ paymentId: failed.id })
        } else {
          await api.billing.dunningAction.mutate({
            invoiceId: item.invoice.id,
            memberId: item.invoice.memberId,
            action: action === 'called' ? 'called' : 'access-paused',
          })
        }
        return api.queue.setState.mutate({
          id: `dun-${item.invoice.id}`,
          queue: 'dunning',
          status: 'done',
          resolution: label,
        })
      },
      {
        success: () => ({
          title: label,
          detail,
          // The clear is stored now, so Undo has to write too rather than just
          // dropping an id out of a local array.
          action: { label: 'Undo', onClick: () => void reopen(item) },
        }),
      },
    )
  }

  const reopen = async (item: DunningItem) => {
    await mutate(
      () =>
        api.queue.setState.mutate({ id: `dun-${item.invoice.id}`, queue: 'dunning', status: 'open' }),
      { success: () => ({ title: 'Back in the queue', detail: item.invoice.id }) },
    )
  }

  return (
    <RequireScreen screen="billing">
      <PageHeader
        title="Dunning"
        crumbs={[
          { label: 'FlexFit Studio', href: '/dashboard' },
          { label: 'Billing', href: '/billing' },
          { label: 'Dunning' },
        ]}
        meta={
          <>
            <span className="tnum">{num(open.length)} invoices in recovery</span>
            <span aria-hidden>·</span>
            <span className="tnum">{compactMoney(atStake)} unsettled</span>
          </>
        }
        sticky={false}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <BillingTabs counts={{ '/billing': invoices.length, '/billing/dunning': open.length }} />
          <div className="w-full max-w-64">
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              placeholder="Search member, invoice or plan"
              aria-label="Search the dunning queue"
              className="h-7"
            />
          </div>
        </div>
      </PageHeader>

      <PageBody>
        <Card className="grid grid-cols-2 lg:grid-cols-4">
          <KpiTile label="In recovery" value={num(open.length)} footnote="Failed or late invoices" />
          <KpiTile label="Unsettled" value={compactMoney(atStake)} footnote="One cycle only" />
          <KpiTile
            label="Monthly value behind it"
            value={compactMoney(recoverable)}
            footnote="What lapses if recovery fails"
          />
          <KpiTile
            label="Cleared"
            value={num(all.length - open.length)}
            footnote={all.length === open.length ? 'Nothing cleared yet' : 'Handled and off the queue'}
          />
        </Card>

        <Card>
          <CardHeader
            title="The ladder"
            description="Fixed schedule from the first failure. Two rungs need a human; the rest run themselves."
          />
          <CardBody className="grid gap-2 sm:grid-cols-5">
            {DUNNING_LADDER.map((step) => {
              const count = open.filter((i) => i.step.id === step.id).length
              const active = rung === step.id
              return (
                <button
                  key={step.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setRung(active ? 'all' : step.id)}
                  className={cn(
                    'flex flex-col gap-1 rounded-md border p-2.5 text-left transition-colors duration-150 ease-[var(--ease-ui)]',
                    active
                      ? 'border-primary bg-primary-soft'
                      : 'border-border bg-surface hover:border-border-strong',
                  )}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-micro font-medium tracking-wide text-muted-foreground uppercase">
                      Day {step.onDay}
                    </span>
                    <span className="text-sm font-semibold text-foreground tnum">{count}</span>
                  </span>
                  <span className="text-sm font-medium text-foreground">{step.label}</span>
                  <span className="text-micro leading-relaxed text-muted-foreground">{step.action}</span>
                  <StatusChip
                    tone={step.automatic ? 'neutral' : 'warn'}
                    label={step.automatic ? 'Automatic' : 'Needs staff'}
                    className="mt-0.5 self-start"
                  />
                </button>
              )
            })}
          </CardBody>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title={rung === 'all' ? 'All invoices in recovery' : `Rung: ${DUNNING_LADDER.find((s) => s.id === rung)?.label}`}
            description="Ordered by invoice amount plus the monthly value at risk behind it."
            actions={
              rung === 'all' ? null : (
                <Button variant="ghost" size="sm" onClick={() => setRung('all')}>
                  Show all rungs
                </Button>
              )
            }
          />
          {rows.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title={
                  open.length === 0
                    ? 'Nothing in recovery'
                    : query.trim()
                      ? `Nothing in recovery matches “${query.trim()}”`
                      : 'No invoices on this rung'
                }
                description={
                  open.length === 0
                    ? 'Every failed invoice this cycle has been settled or written off.'
                    : query.trim()
                      ? 'Search covers the member name, the invoice number and the plan.'
                      : 'Pick another rung, or show the whole queue.'
                }
                action={{
                  label: query.trim() ? 'Clear the search' : 'Show all rungs',
                  onClick: () => {
                    setQuery('')
                    setRung('all')
                  },
                }}
              />
            </div>
          ) : (
            <TableWrap>
              <Table>
                <Thead>
                  <tr>
                    <SerialTh />
                    <Th>Member</Th>
                    <Th width={110}>Invoice</Th>
                    <Th align="right" width={110}>Amount</Th>
                    <Th width={90}>Late</Th>
                    <Th width={150}>Current step</Th>
                    <Th width={110}>Next action</Th>
                    <Th width={110}>Risk</Th>
                    <Th width={220} />
                  </tr>
                </Thead>
                <Tbody>
                  {rows.map((item, i) => (
                    <Tr key={item.invoice.id}>
                      <SerialTd index={i} />
                      <Td>
                        <CellStack
                          primary={
                            <Link
                              href={`/members/${item.invoice.memberId}`}
                              className="hover:text-primary hover:underline"
                            >
                              {item.invoice.memberName}
                            </Link>
                          }
                          secondary={`${compactMoney(item.monthlyValue)}/mo · attempt ${item.attempts}`}
                        />
                      </Td>
                      <Td>
                        <Link
                          href={`/billing/invoices/${item.invoice.id}`}
                          className="font-mono text-micro text-primary underline-offset-2 hover:underline"
                        >
                          {item.invoice.id}
                        </Link>
                      </Td>
                      <Td align="right" className="tnum font-medium">{money(item.invoice.amount)}</Td>
                      <Td className="tnum">
                        <span className={item.invoice.overdueDays >= 12 ? 'text-danger' : 'text-muted-foreground'}>
                          {item.invoice.overdueDays}d
                        </span>
                      </Td>
                      <Td>
                        <StatusChip
                          tone={item.paused ? 'danger' : item.step.automatic ? 'info' : 'warn'}
                          label={item.step.label}
                        />
                      </Td>
                      <Td muted className="tnum">{shortDate(item.nextActionDate)}</Td>
                      <Td><RiskScore score={item.riskScore} /></Td>
                      <Td>
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="secondary"
                            size="xs"
                            disabled={busy}
                            onClick={() =>
                              act(
                                item,
                                'retry',
                                'Retry queued',
                                `${item.invoice.memberName} — ${money(item.invoice.amount)} on the saved ${item.invoice.method.toUpperCase()}.`,
                              )
                            }
                          >
                            <RefreshCw />
                            Retry
                          </Button>
                          <Button
                            variant="secondary"
                            size="xs"
                            disabled={busy}
                            onClick={() =>
                              act(
                                item,
                                'called',
                                'Logged as called',
                                `Call logged against ${item.invoice.id}. Ladder pauses 48h while they fix the card.`,
                              )
                            }
                          >
                            <PhoneCall />
                            Called
                          </Button>
                          {/* Chasing an overdue invoice by email was the one rung
                              of this ladder with no button behind it — you could
                              log a call you had made, but not send the message
                              the ladder actually asks for. */}
                          <Button
                            variant="secondary"
                            size="xs"
                            disabled={connection !== 'live' || !getMember(item.invoice.memberId)}
                            title={`Email ${item.invoice.memberName} about ${item.invoice.id}`}
                            onClick={() => setEmailTarget(item)}
                          >
                            <Mail />
                            Email
                          </Button>
                          <Button
                            variant={item.paused ? 'danger' : 'ghost'}
                            size="xs"
                            onClick={() => setPauseTarget(item)}
                          >
                            Pause access
                          </Button>
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableWrap>
          )}
        </Card>
      </PageBody>

      {emailTarget && getMember(emailTarget.invoice.memberId) ? (
        <ComposeEmailDialog
          open
          onClose={() => setEmailTarget(null)}
          to={getMember(emailTarget.invoice.memberId)!.email}
          toName={emailTarget.invoice.memberName}
          title={`Email about ${emailTarget.invoice.id}`}
          send={({ subject, body }) =>
            api.comms.emailMember.mutate({
              memberId: emailTarget.invoice.memberId,
              subject,
              body,
            })
          }
          templates={[
            {
              label: emailTarget.step.label,
              subject: `${emailTarget.invoice.id} — ${money(emailTarget.invoice.amount)} outstanding`,
              body: [
                `Hi ${getMember(emailTarget.invoice.memberId)!.firstName},`,
                '',
                `${emailTarget.invoice.id} for ${emailTarget.invoice.planName} is ${emailTarget.invoice.overdueDays} days past due — ${money(emailTarget.invoice.amount)} on the ${emailTarget.invoice.method.toUpperCase()} we have on file.`,
                '',
                emailTarget.paused
                  ? 'Check-in is paused until it clears. Your membership itself is intact and access comes straight back the moment the payment goes through.'
                  : 'Nothing has changed about your membership. We will keep retrying the saved card.',
                '',
                'If the card needs updating, reply here or drop by the desk and we will sort it in a minute.',
                '',
                'FlexFit Studio',
              ].join('\n'),
            },
          ]}
        />
      ) : null}

      <ConfirmDialog
        open={pauseTarget !== null}
        onClose={() => setPauseTarget(null)}
        onConfirm={() => {
          if (!pauseTarget) return
          const target = pauseTarget
          setPauseTarget(null)
          void act(
            target,
            'access-paused',
            'Access paused',
            `${target.invoice.memberName} can't check in until ${target.invoice.id} clears. Membership is intact.`,
          )
        }}
        title="Pause check-in access?"
        description={pauseTarget ? `${pauseTarget.invoice.memberName} · ${pauseTarget.invoice.id}` : undefined}
        consequence={
          pauseTarget
            ? `The kiosk will show a RED result and the front desk gets the reason. ${money(pauseTarget.invoice.amount)} stays owed; the membership is not cancelled.`
            : undefined
        }
        confirmLabel="Pause access"
      >
        <p className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
          Access restores itself the moment the invoice is paid — no staff step needed.
        </p>
      </ConfirmDialog>
    </RequireScreen>
  )
}
