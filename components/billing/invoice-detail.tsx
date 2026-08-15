'use client'

import * as React from 'react'
import Link from 'next/link'
import { Mail, Printer, RefreshCw, Send } from 'lucide-react'
import { PageHeader, PageBody } from '@/components/shell/page-header'
import { RequireScreen } from '@/components/shell/app-shell'
import { Card, CardBody, CardHeader, CardFooter, DataPoint } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConfirmDialog, ConsequenceNotice } from '@/components/ui/modal'
import { PaymentStatus, StatusChip } from '@/components/ui/status-chip'
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/input'
import { ComposeEmailDialog } from '@/components/comms/compose-email-dialog'
import { api } from '@/lib/api/client'
import { useDataVersion, useStudio } from '@/lib/store/studio-store'
import { clock, fullDate, money, shortDate } from '@/lib/format'
import { paymentById } from '@/lib/data/payments'
import { getMember } from '@/lib/data/members'
import { DUNNING_LADDER, paymentsForInvoice, type Invoice } from './billing-data'

/**
 * One invoice. Two rules the whole billing surface obeys:
 * a refund never edits history (it adds a paired reversal row), and every
 * recovery action states what the member will experience before you send it.
 */
export function InvoiceDetail({ invoice }: { invoice: Invoice }) {
  const { mutate, busy, connection } = useStudio()
  const version = useDataVersion()
  const [refundOpen, setRefundOpen] = React.useState(false)
  const [emailOpen, setEmailOpen] = React.useState(false)
  const [alsoEmail, setAlsoEmail] = React.useState(false)
  const member = React.useMemo(
    () => getMember(invoice.memberId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [invoice.memberId, version],
  )
  const rows = React.useMemo(() => paymentsForInvoice(invoice), [invoice, version])
  const unsettled = invoice.status === 'failed' || invoice.status === 'pending'
  const step = DUNNING_LADDER.find((s) => invoice.overdueDays >= s.onDay)

  /** The row a refund reverses / a retry reattempts — an invoice is a derivation. */
  const settled = React.useMemo(
    () =>
      invoice.paymentIds
        .map((id) => paymentById.get(id))
        .filter((p): p is NonNullable<typeof p> => Boolean(p)),
    [invoice.paymentIds, version],
  )
  const refundable = settled.find((p) => p.status === 'paid' && p.reversalOf === null)
  const lastFailure = settled
    .filter((p) => p.status === 'failed')
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0]

  async function retry() {
    if (!lastFailure) return
    await mutate(() => api.billing.retry.mutate({ paymentId: lastFailure.id }), {
      success: () => ({
        title: 'Card retry queued',
        detail: `${invoice.memberName} will be charged ${money(invoice.amount)}. They get one SMS if it fails again.`,
      }),
    })
  }

  async function refund() {
    if (!refundable) return
    setRefundOpen(false)
    await mutate(
      async () => {
        const reversal = await api.billing.refund.mutate({
          paymentId: refundable.id,
          reason: `Refunded from ${invoice.id}`,
        })
        // A credit note is a second, independent send. It is attempted after the
        // money moves, never instead of it, so a mail failure cannot make it
        // look like the refund did not happen.
        if (alsoEmail) {
          await api.comms.emailMember.mutate({
            memberId: invoice.memberId,
            subject: `Credit note for ${invoice.id}`,
            body: [
              `Hi ${getMember(invoice.memberId)?.firstName ?? invoice.memberName},`,
              `We have refunded ${money(invoice.amount)} against ${invoice.id} (${invoice.planName}).`,
              `It goes back to the original ${invoice.method.toUpperCase()} instrument and usually shows within 5–7 days.`,
              'If you do not see it after a week, reply to this email and we will chase it.',
              'FlexFit Studio',
            ].join('\n\n'),
          })
        }
        return reversal
      },
      {
        success: () => ({
          title: `Reversal row added to ${invoice.id}`,
          detail: alsoEmail
            ? `${money(invoice.amount)} refunded and a credit note emailed to ${invoice.memberName}.`
            : `${money(invoice.amount)} back to the original ${invoice.method.toUpperCase()} instrument in 5–7 days.`,
        }),
      },
    )
  }

  return (
    <RequireScreen screen="billing">
      <PageHeader
        title={invoice.id}
        crumbs={[
          { label: 'FlexFit Studio', href: '/dashboard' },
          { label: 'Billing', href: '/billing' },
          { label: invoice.id },
        ]}
        meta={
          <>
            <span>{invoice.planName}</span>
            <span aria-hidden>·</span>
            <span className="tnum">Issued {fullDate(invoice.issuedDate)}</span>
            <span aria-hidden>·</span>
            <span className="tnum">Due {fullDate(invoice.dueDate)}</span>
          </>
        }
        actions={
          <>
            {/* The print stylesheet in globals.css is what makes this useful —
                it drops the shell and prints the invoice alone. */}
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <Printer />
              Print
            </Button>
            {/* Sending the invoice is the commonest thing anyone wants to do
                from this screen and there was no way to do it — Print was the
                only way an invoice left the building. Disabled rather than
                hidden when it cannot work, with the reason on the tooltip. */}
            <Button
              variant="secondary"
              size="sm"
              disabled={!member || connection !== 'live'}
              title={
                !member
                  ? 'This invoice has no member record to send to.'
                  : connection !== 'live'
                    ? 'No connection to the server, so nothing can be sent.'
                    : `Send ${invoice.id} to ${member.email}`
              }
              onClick={() => setEmailOpen(true)}
            >
              <Mail />
              Email invoice
            </Button>
            {invoice.status === 'paid' && refundable ? (
              <Button variant="danger" size="sm" disabled={busy} onClick={() => setRefundOpen(true)}>
                Refund
              </Button>
            ) : unsettled && lastFailure ? (
              <Button variant="primary" size="sm" disabled={busy} onClick={retry}>
                <RefreshCw />
                Retry card
              </Button>
            ) : null}
          </>
        }
        sticky={false}
      />

      <PageBody>
        {invoice.overdueDays > 0 ? (
          <ConsequenceNotice
            tone={invoice.overdueDays >= 18 ? 'danger' : 'warn'}
            headline={`${invoice.overdueDays} days past due — ${step?.label ?? 'Retry card'} is the current step`}
            detail={
              <>
                {step?.action} Access is paused on day 18, not cancelled.{' '}
                <Link href="/billing/dunning" className="font-medium underline underline-offset-2">
                  Open the dunning queue
                </Link>
                .
              </>
            }
          />
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader
              title="Line items"
              description={`${invoice.description} · ${invoice.method.toUpperCase()}`}
              actions={<PaymentStatus status={invoice.status} />}
            />
            <TableWrap>
              <Table>
                <Thead>
                  <tr>
                    <Th>Item</Th>
                    <Th align="right" width={70}>Qty</Th>
                    <Th align="right" width={110}>Unit</Th>
                    <Th align="right" width={120}>Amount</Th>
                  </tr>
                </Thead>
                <Tbody>
                  {invoice.lines.map((line) => (
                    <Tr key={line.label}>
                      <Td>
                        <span className="font-medium text-foreground">{line.label}</span>
                        <span className="ml-2 text-micro text-muted-foreground">{line.detail}</span>
                      </Td>
                      <Td align="right" muted className="tnum">{line.qty}</Td>
                      <Td align="right" muted className="tnum">{money(line.unit, { paise: true })}</Td>
                      <Td align="right" className="tnum font-medium">{money(line.amount, { paise: true })}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableWrap>
            <CardFooter>
              <span>Net {money(invoice.netAmount, { paise: true })} + GST {money(invoice.taxAmount, { paise: true })}</span>
              <span className="text-base font-semibold text-foreground tnum">
                {money(invoice.amount, { paise: true })}
              </span>
            </CardFooter>
          </Card>

          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader title="Billed to" />
              <CardBody className="grid grid-cols-2 gap-4">
                <DataPoint
                  label="Member"
                  value={
                    <Link
                      href={`/members/${invoice.memberId}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {invoice.memberName}
                    </Link>
                  }
                  sub={invoice.memberId}
                />
                <DataPoint label="Method" value={invoice.method.toUpperCase()} sub="Saved instrument" />
                <DataPoint label="Plan" value={invoice.planName} sub={invoice.planId ?? '—'} />
                <DataPoint label="Cycle" value={shortDate(invoice.issuedDate)} sub={`Due ${shortDate(invoice.dueDate)}`} />
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Ledger"
                description="Reversals are appended, never overwritten."
              />
              <CardBody className="flex flex-col gap-2.5">
                {rows.map((row) => (
                  <div key={row.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {row.reversalOf ? 'Reversal' : 'Charge'}
                        <span className="ml-1.5 font-mono text-micro text-muted-foreground">{row.id}</span>
                      </p>
                      <p className="text-micro text-muted-foreground tnum">
                        {shortDate(row.date)} · {clock(row.date)} · {row.method.toUpperCase()}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-medium text-foreground tnum">{money(row.amount)}</span>
                      {row.reversalOf ? (
                        <StatusChip tone="info" label="Reversal" />
                      ) : (
                        <PaymentStatus status={row.status} />
                      )}
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>
          </div>
        </div>
      </PageBody>

      {member ? (
        <ComposeEmailDialog
          open={emailOpen}
          onClose={() => setEmailOpen(false)}
          to={member.email}
          toName={member.name}
          title={`Email ${invoice.id}`}
          send={({ subject, body }) =>
            api.comms.emailMember.mutate({ memberId: member.id, subject, body })
          }
          /* The invoice's own state decides which template opens first: a paid
             invoice wants a receipt, an unpaid one wants asking for. Offering
             "your payment has been received" against a failed card is how a
             billing screen loses an operator's trust. */
          templates={
            invoice.status === 'paid'
              ? [
                  {
                    label: 'Receipt',
                    subject: `Receipt for ${invoice.id} — ${money(invoice.amount)}`,
                    body: [
                      `Hi ${member.firstName},`,
                      '',
                      `Thanks — we have received ${money(invoice.amount)} for ${invoice.planName}.`,
                      '',
                      `Invoice: ${invoice.id}`,
                      `Issued: ${fullDate(invoice.issuedDate)}`,
                      `Paid by: ${invoice.method.toUpperCase()}`,
                      `Net ${money(invoice.netAmount)} + GST ${money(invoice.taxAmount)} = ${money(invoice.amount)}`,
                      '',
                      'Keep this for your records. Reply to this email if anything looks wrong.',
                      '',
                      'FlexFit Studio',
                    ].join('\n'),
                  },
                ]
              : [
                  {
                    label: invoice.overdueDays > 0 ? 'Overdue reminder' : 'Payment request',
                    subject:
                      invoice.overdueDays > 0
                        ? `${invoice.id} is ${invoice.overdueDays} days overdue`
                        : `${invoice.id} — ${money(invoice.amount)} due ${fullDate(invoice.dueDate)}`,
                    body: [
                      `Hi ${member.firstName},`,
                      '',
                      invoice.overdueDays > 0
                        ? `${invoice.id} for ${invoice.planName} is ${invoice.overdueDays} days past its due date of ${fullDate(invoice.dueDate)}.`
                        : `${invoice.id} for ${invoice.planName} is due on ${fullDate(invoice.dueDate)}.`,
                      '',
                      `Amount: ${money(invoice.amount)} (net ${money(invoice.netAmount)} + GST ${money(invoice.taxAmount)})`,
                      `Method on file: ${invoice.method.toUpperCase()}`,
                      '',
                      invoice.overdueDays >= 18
                        ? 'Access is paused while this is outstanding — it comes straight back once the payment goes through. Reply here if the card needs changing.'
                        : 'We will retry the saved card. Reply here if you would rather pay another way, or if the card needs changing.',
                      '',
                      'FlexFit Studio',
                    ].join('\n'),
                  },
                  {
                    label: 'Card needs updating',
                    subject: `Your card on file was declined — ${invoice.id}`,
                    body: [
                      `Hi ${member.firstName},`,
                      '',
                      `The ${invoice.method.toUpperCase()} we have on file was declined for ${money(invoice.amount)} (${invoice.planName}).`,
                      '',
                      'Nothing has changed about your membership. Drop by the desk or reply to this email and we will take it another way.',
                      '',
                      'FlexFit Studio',
                    ].join('\n'),
                  },
                ]
          }
        />
      ) : null}

      <ConfirmDialog
        open={refundOpen}
        onClose={() => setRefundOpen(false)}
        onConfirm={refund}
        title={`Refund ${money(invoice.amount)}?`}
        description={`${invoice.memberName} · ${invoice.planName}`}
        consequence={`This adds a −${money(invoice.amount)} reversal row. ${invoice.id} stays on record as paid.`}
        confirmLabel="Refund to source"
      >
        <p className="text-sm leading-relaxed text-muted-foreground">
          Membership access is unaffected. If you meant to end the membership instead, cancel it from
          the member profile — a refund alone leaves the plan active.
        </p>
        <label className="mt-2 flex items-center gap-2 text-sm text-foreground">
          <Checkbox checked={alsoEmail} onChange={(e) => setAlsoEmail(e.currentTarget.checked)} />
          <Send className="size-3.5 text-muted-foreground" aria-hidden />
          Also email the member a credit note
        </label>
      </ConfirmDialog>
    </RequireScreen>
  )
}
