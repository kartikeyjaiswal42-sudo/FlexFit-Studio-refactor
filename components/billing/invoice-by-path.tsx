'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'
import { Receipt } from 'lucide-react'
import { PageHeader, PageBody } from '@/components/shell/page-header'
import { RequireScreen } from '@/components/shell/app-shell'
import { EmptyState, TableSkeleton } from '@/components/ui/empty-state'
import { useStudio } from '@/lib/store/studio-store'
import { getInvoice } from './billing-data'
import { InvoiceDetail } from './invoice-detail'

/**
 * An invoice resolved from the URL rather than from the build.
 *
 * The counterpart of components/members/profile/member-by-path.tsx, and it
 * matters for the same reason: taking a payment mints a brand-new invoice id
 * (`INV-<timestamp>` — see ops.takePayment), and a static export has no page
 * for an id that did not exist when it was built. The Worker was answering
 * those with the invoice LIST, so the invoice you had just raised looked like
 * it had never been created.
 *
 * Invoices are derived from payment rows rather than stored, so `getInvoice`
 * starts answering as soon as the store has hydrated the new payment.
 */
export function InvoiceByPath() {
  const pathname = usePathname() ?? ''
  const { connection, version } = useStudio()

  const id = React.useMemo(() => {
    const match = /^\/billing\/invoices\/([^/]+)/.exec(pathname)
    return match ? decodeURIComponent(match[1]) : null
  }, [pathname])

  const invoice = React.useMemo(
    () => (id ? getInvoice(id) : undefined),
    // Rebuilt in place by hydrate(); `version` is what changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, version],
  )

  if (invoice) return <InvoiceDetail invoice={invoice} />

  if (connection === 'connecting') {
    return (
      <div className="p-4">
        <TableSkeleton rows={6} cols={4} />
      </div>
    )
  }

  return (
    <RequireScreen screen="billing">
      <PageHeader
        title="Invoice not found"
        crumbs={[
          { label: 'FlexFit Studio', href: '/dashboard' },
          { label: 'Billing', href: '/billing' },
          { label: id ?? 'Unknown' },
        ]}
        sticky={false}
      />
      <PageBody>
        <EmptyState
          icon={Receipt}
          title={id ? `No invoice numbered ${id}` : 'No invoice number in the address'}
          description={
            connection === 'offline'
              ? 'The app could not reach the server, so it can only see the invoices it was built with. Reload once the connection is back.'
              : 'An invoice is the set of payment rows sharing its number, so one appears here as soon as a payment is taken.'
          }
          action={{ label: 'Back to billing', href: '/billing' }}
        />
      </PageBody>
    </RequireScreen>
  )
}
