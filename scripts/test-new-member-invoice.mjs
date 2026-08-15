/**
 * Add a member, charge them, open the invoice that produced.
 *
 *     node scripts/test-new-member-invoice.mjs [baseUrl]
 *
 * LOCAL ONLY. This CREATES A MEMBER AND TAKES A PAYMENT — both are real rows in
 * the database and neither is undone afterwards. Run it against a local D1 you
 * can reseed, never against production.
 *
 * It exists because the reported fault was a chain, not a button: a member
 * created after the build had no exported page, so the app dropped you back on
 * the directory; from there the profile, its Billing tab, the payment it takes
 * and the invoice that payment mints were all unreachable. Every link in that
 * chain is walked here in one go, ending on the invoice's own page with its
 * Email button — because checking any single link would have passed while the
 * chain stayed broken.
 */

import { chromium } from 'playwright'

const BASE = process.argv[2] || 'http://127.0.0.1:8795'
if (/workers\.dev|https:/.test(BASE)) {
  console.error('Refusing to run: this suite creates a member and takes a payment. Local only.')
  process.exit(2)
}

let pass = 0
let fail = 0
const ok = (m) => {
  console.log(`  ok   ${m}`)
  pass++
}
const bad = (m) => {
  console.log(`  FAIL ${m}`)
  fail++
}

async function waitFor(fn, timeoutMs = 20000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await fn().catch(() => false)) return true
    await new Promise((r) => setTimeout(r, 200))
  }
  return false
}

const browser = await chromium.launch({ channel: 'chrome' })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

async function go(path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForSelector('h1', { timeout: 25000 }).catch(() => {})
  await page.waitForTimeout(1400) // past hydration — see test-fixes-ui.mjs
}

/** Read the database directly, so no assertion rests on a toast. */
async function bootstrap() {
  const res = await fetch(`${BASE}/api/trpc/read.bootstrap?input=${encodeURIComponent('{}')}`)
  const json = await res.json()
  return json.result.data
}

const stamp = Date.now().toString(36)
const first = 'Invoice'
const last = `Check${stamp}`
const fullName = `${first} ${last}`

/* ---------------------------------------------------------------- 1. create */
const before = await bootstrap()
await go('/members')
await page.getByRole('button', { name: /add member/i }).first().click()
await waitFor(async () => (await page.locator('#am-first').count()) > 0)
await page.fill('#am-first', first)
await page.fill('#am-last', last)
await page.fill('#am-email', `invoice.check.${stamp}@example.com`)
await page.fill('#am-phone', '+91 98765 43210')
await page.getByRole('button', { name: /^add member$/i }).last().click()

const onProfile = await waitFor(async () => /\/members\/m-new-/.test(page.url()), 25000)
onProfile
  ? ok(`the new member's own URL is opened (${new URL(page.url()).pathname})`)
  : bad(`after adding, the app went to ${new URL(page.url()).pathname}`)

const after = await bootstrap()
after.members.length === before.members.length + 1
  ? ok('the member is a real row in the database')
  : bad(`members went ${before.members.length} → ${after.members.length}`)

const heading = await page.locator('h1').first().innerText()
heading.includes(fullName)
  ? ok(`their profile renders under their own name (${heading.replace(/\n/g, ' ')})`)
  : bad(`the page heading reads "${heading.replace(/\n/g, ' ')}", not ${fullName}`)

const profileBody = await page.locator('body').innerText()
;/overview/i.test(profileBody) && /billing/i.test(profileBody) && /attendance/i.test(profileBody)
  ? ok('with the full set of profile tabs')
  : bad('the profile tabs are missing — this is the directory, not a profile')

/* ------------------------------------------------------- 2. charge them */
const paymentsBefore = after.payments.length
await page.getByRole('tab', { name: /billing/i }).first().click()
await page.waitForTimeout(900)

const takeBtn = page.getByRole('button', { name: /take payment/i }).first()
;(await takeBtn.count()) > 0
  ? ok('their billing tab offers Take payment')
  : bad('there is no way to charge the new member')
await takeBtn.click()
await waitFor(async () => (await page.locator('#pay-amount').count()) > 0)
const submit = page.getByRole('button', { name: /^take ₹|^recording/i }).first()
await submit.click()

const charged = await waitFor(async () => (await bootstrap()).payments.length === paymentsBefore + 1, 25000)
charged ? ok('the payment is written to the ledger') : bad('no payment row was created')

const latest = (await bootstrap()).payments.find((p) => p.memberId === new URL(page.url()).pathname.split('/').pop())
latest?.invoiceId
  ? ok(`an invoice number was minted with it (${latest.invoiceId})`)
  : bad('the payment carries no invoice number')

/* --------------------------------------------------- 3. open that invoice */
if (latest?.invoiceId) {
  await go(`/billing/invoices/${latest.invoiceId}`)
  const invoiceHeading = await page.locator('h1').first().innerText()
  invoiceHeading.includes(latest.invoiceId)
    ? ok(`the invoice opens at its own URL (${invoiceHeading.trim()})`)
    : bad(`/billing/invoices/${latest.invoiceId} rendered "${invoiceHeading.trim()}"`)

  const invoiceBody = await page.locator('body').innerText()
  invoiceBody.includes(fullName)
    ? ok('and is billed to the member who was just created')
    : bad('the invoice does not name the new member')

  const emailBtn = page.getByRole('button', { name: /email invoice/i }).first()
  ;(await emailBtn.count()) > 0 && (await emailBtn.isEnabled())
    ? ok('the invoice can be emailed to them')
    : bad('no working Email button on the new invoice')

  // The invoice also has to be findable from the list, not only by URL.
  await go('/billing')
  await page.getByLabel('Search invoices').fill(last)
  await waitFor(async () => (await page.locator('tbody tr').count()) > 0)
  const found = await page.locator('tbody tr').first().innerText()
  found.includes(fullName)
    ? ok('and it is findable in the invoice list by the member’s name')
    : bad(`searching billing for "${last}" found "${found.replace(/\n/g, ' ').slice(0, 60)}"`)
}

errors.length === 0 ? ok('no page errors') : bad(`page errors: ${errors.slice(0, 2).join(' | ')}`)

await browser.close()
console.log('\n' + '='.repeat(52))
console.log(`${pass} passed, ${fail} failed`)
console.log(`(left behind: member ${fullName} and one payment — reseed the local DB to clear)`)
console.log('='.repeat(52))
process.exit(fail === 0 ? 0 : 1)
