import type { Metadata } from 'next'
import { InvoiceByPath } from '@/components/billing/invoice-by-path'

export const metadata: Metadata = {
  title: 'Invoice — FlexFit Studio',
  description: 'Invoice resolved from the address.',
}

/**
 * The fallback shell for `/billing/invoices/<id>` — the invoice equivalent of
 * `/members/profile`. Invoice ids are minted when a payment is taken, so the
 * ones that matter most are exactly the ones the build never saw.
 *
 * Real ids are `INV-…`, so "detail" cannot shadow one.
 */
export default function InvoiceDetailShellPage() {
  return <InvoiceByPath />
}
