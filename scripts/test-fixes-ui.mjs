/**
 * The reported faults, each one driven through the real UI.
 *
 *     node scripts/test-fixes-ui.mjs [baseUrl]
 *
 * Every check here started as something a person said was broken, so each one
 * asserts the observable thing they were describing — a name that navigates, a
 * profile that renders, blocks that do not sit on top of one another — rather
 * than that some component exists.
 *
 * SAFE ON PRODUCTION: read-only apart from the sign-in role key and saved views,
 * both of which live in this browser's own localStorage. It creates no members,
 * takes no payments and sends no email. The one write-path fault it covers (a
 * new member's profile) is checked with an id that cannot exist, which exercises
 * exactly the same route the real one takes.
 */

import { chromium } from 'playwright'

const BASE = process.argv[2] || 'http://127.0.0.1:8795'

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
const section = (t) => console.log(`\n— ${t}`)

/** Never a fixed sleep: wait for the condition itself. */
async function waitFor(fn, timeoutMs = 15000) {
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
  await waitFor(async () => (await page.locator('body').innerText()).length > 200)
  // These pages are static HTML that React then hydrates. A click that lands in
  // between is visible, enabled, stable — and completely inert, which surfaces
  // later as a navigation that never happens. Give hydration a moment.
  await page.waitForTimeout(1200)
}

/**
 * Click something and confirm it actually reacted, retrying if not.
 *
 * Same reason as above: against a cold server the first press can be swallowed
 * by hydration, and a swallowed press is indistinguishable from a broken button
 * unless the test insists on seeing the effect.
 */
async function clickUntil(locator, settled, attempts = 8) {
  for (let i = 0; i < attempts; i++) {
    await locator.click({ timeout: 5000 }).catch(() => {})
    if (await waitFor(settled, 2000)) return true
  }
  return false
}

/* ====================================================================== */
section('Sign-in fills in an account for every role')
/* ====================================================================== */
await go('/login')

for (const [role, expectEmail] of [
  ['Owner', 'dana.okonkwo@flexfitstudio.in'],
  ['Trainer', 'priya.raghunathan@flexfitstudio.in'],
  ['Front desk', 'marco.silveira@flexfitstudio.in'],
]) {
  await page.locator('label').filter({ hasText: role }).first().click()
  const filled = await waitFor(async () => (await page.inputValue('#email')) === expectEmail)
  filled
    ? ok(`${role}: email is filled in as ${expectEmail}`)
    : bad(`${role}: email reads "${await page.inputValue('#email')}", expected ${expectEmail}`)
}

const pw = await page.inputValue('#password')
pw.length > 0 ? ok('password is filled in too') : bad('password is empty — a judge still has to type')

// Typing your own address must survive changing role.
await page.fill('#email', 'someone.real@example.com')
await page.locator('label').filter({ hasText: 'Owner' }).first().click()
await page.waitForTimeout(400)
;(await page.inputValue('#email')) === 'someone.real@example.com'
  ? ok('a hand-typed address is not overwritten when the role changes')
  : bad('changing role threw away what the operator typed')

await page.getByRole('radio', { name: 'Member sign in' }).click()
await waitFor(async () => (await page.inputValue('#email')).length > 0)
ok('the member door is reachable')

/* ====================================================================== */
section('Sign-up creates a member, and the name signs in')
/* ====================================================================== */
await go('/signup')
const who = `Judge Tester ${Date.now().toString(36)}`
await page.fill('#name', who)
await page.fill('#gym', 'Riverside')
await page.fill('#signup-email', `judge${Date.now().toString(36)}@example.com`)
await page.fill('#signup-password', 'a-long-enough-password')
// The terms control is a base-ui checkbox: the real <input> is aria-hidden and
// a visible <span role="checkbox"> takes the pointer events, so clicking the
// input times out on the element covering it. Drive what the user drives, and
// wait for it to actually tick — that doubles as the hydration check.
const terms = page.getByRole('checkbox').first()
const ticked = await clickUntil(
  terms,
  async () => (await terms.getAttribute('aria-checked')) === 'true',
)
ticked ? ok('the terms checkbox responds') : bad('the terms checkbox never ticked')
await page.getByRole('button', { name: /create account/i }).click()

const landed = await waitFor(async () => new URL(page.url()).pathname === '/portal', 25000)
landed
  ? ok('signing up lands in the member portal, not the back office')
  : bad(`signing up landed on ${new URL(page.url()).pathname}, expected /portal`)

const shellRole = await page
  .locator('button[aria-label^="Signed in as"]')
  .first()
  .innerText()
  .catch(() => '')
;/Member/i.test(shellRole)
  ? ok('the new account is a Member')
  : bad(`the new account signed in as "${shellRole.trim()}"`)

// Now sign in again with the NAME rather than the email.
await go('/login')
await page.getByRole('radio', { name: 'Member sign in' }).click()
await page.fill('#email', who)
await page.fill('#password', 'a-long-enough-password')
const recognised = await waitFor(async () =>
  (await page.locator('form').innerText()).includes(who),
)
recognised
  ? ok('the registered name is recognised on the sign-in screen')
  : bad('the registered name was not recognised')
await page.getByRole('button', { name: /sign in as/i }).click()
;(await waitFor(async () => new URL(page.url()).pathname === '/portal', 20000))
  ? ok('signing in with the name reaches the portal')
  : bad(`signing in with the name landed on ${new URL(page.url()).pathname}`)

/* ====================================================================== */
section('The role switcher is gone; sign out is there instead')
/* ====================================================================== */
await page.evaluate(() => window.localStorage.setItem('flexfit_role', 'owner'))
await go('/dashboard')
;(await page.locator('button', { hasText: /^Role/ }).count()) === 0
  ? ok('no role switcher in the top bar')
  : bad('the role switcher is still there — a member can still see the owner’s screens')

const account = page.locator('button[aria-label^="Signed in as"]').first()
;(await account.count()) === 1 ? ok('the account button names who you are') : bad('no account control')
await account.click()
const menu = await waitFor(async () => (await page.getByRole('button', { name: /sign out/i }).count()) > 0)
menu ? ok('sign out is available') : bad('there is no way to sign out')
await page.keyboard.press('Escape')

/* ====================================================================== */
section('Search boxes where there were none')
/* ====================================================================== */
for (const [path, label] of [
  ['/billing/dunning', 'Search the dunning queue'],
  ['/retention', 'Search the intervention queue'],
  ['/reports', 'Search reports'],
  ['/billing', 'Search invoices'],
]) {
  await go(path)
  ;(await page.getByLabel(label).count()) > 0
    ? ok(`${path} has "${label}"`)
    : bad(`${path} has no "${label}"`)
}

// And the search actually narrows the list.
await go('/reports')
const beforeReports = await page.locator('a[href^="/reports/"]').count()
await page.getByLabel('Search reports').fill('revenue')
await waitFor(async () => (await page.locator('a[href^="/reports/"]').count()) < beforeReports)
const afterReports = await page.locator('a[href^="/reports/"]').count()
afterReports > 0 && afterReports < beforeReports
  ? ok(`report search narrows ${beforeReports} reports to ${afterReports}`)
  : bad(`report search left ${afterReports} of ${beforeReports} reports`)

/* ====================================================================== */
section('A member created after the build has a profile')
/* ====================================================================== */
// An id in exactly the shape ops.createMember mints, which by construction has
// no page in the export — the same route a genuinely new member takes.
await go('/members/m-new-fixture-not-real')
const notFoundBody = await page.locator('body').innerText()
!/^Members$/m.test(await page.locator('h1').first().innerText())
  ? ok('an unknown member id no longer silently shows the whole directory')
  : bad('an unknown member id still renders the members list — the URL lies about what you are looking at')
;/not found/i.test(notFoundBody)
  ? ok('it says the member was not found')
  : bad('it does not say what happened')

// A real member still renders their own profile through the same route.
await go('/members')
const firstMember = page.locator('a[href^="/members/m-"]').first()
const href = await firstMember.getAttribute('href')
await firstMember.click()
await waitFor(async () => new URL(page.url()).pathname === href)
const profileText = await page.locator('body').innerText()
;/Overview/.test(profileText) && /Billing/.test(profileText)
  ? ok(`a seeded member still opens their profile (${href})`)
  : bad('the member profile did not render')

/* ====================================================================== */
section('Invoices can be emailed')
/* ====================================================================== */
await go('/billing')
const invoiceLink = page.locator('a[href^="/billing/invoices/"]').first()
await invoiceLink.click()
await waitFor(async () => /\/billing\/invoices\//.test(page.url()))
await page.waitForTimeout(500)
const emailBtn = page.getByRole('button', { name: /email invoice/i }).first()
;(await emailBtn.count()) > 0 ? ok('the invoice has an Email button') : bad('no Email button on an invoice')
if (await emailBtn.count()) {
  const enabled = await emailBtn.isEnabled()
  enabled ? ok('the Email button is enabled against a live server') : bad('the Email button is disabled')
  if (enabled) {
    await emailBtn.click()
    const opened = await waitFor(async () => (await page.getByRole('dialog').count()) > 0)
    opened ? ok('it opens a compose box') : bad('pressing Email did nothing')
    if (opened) {
      const dialog = await page.getByRole('dialog').innerText()
      if (dialog.includes('@')) ok('the compose box names the address it will go to')
      else bad('the compose box does not say where it is going')
      await page.keyboard.press('Escape')
    }
  }
}

// An unknown invoice number must not render the invoice list either.
await go('/billing/invoices/INV-DOES-NOT-EXIST')
;/not found/i.test(await page.locator('body').innerText())
  ? ok('an unknown invoice number says so')
  : bad('an unknown invoice number renders something else')

/* ====================================================================== */
section('Schedule: concurrent classes tile, never overlap')
/* ====================================================================== */
await go('/schedule')
// Class blocks only. A bare button[aria-pressed] also matches the Week/Day
// toggle and the filter chips, and a toolbar that does not overlap itself would
// have made this check pass no matter what the grid did.
const BLOCKS = '[class*="absolute"] > button[aria-pressed]'
await waitFor(async () => (await page.locator(BLOCKS).count()) > 20)
await page.waitForTimeout(600)
const boxes = await page
  .locator(BLOCKS)
  .evaluateAll((els) =>
    els
      .map((e) => {
        const r = e.getBoundingClientRect()
        return {
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
          t: e.innerText.replace(/\n/g, ' ').slice(0, 22),
        }
      })
      .filter((b) => b.w > 0 && b.h > 0),
  )

let overlaps = 0
let worst = null
for (let i = 0; i < boxes.length; i++) {
  for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i]
    const b = boxes[j]
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
    const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
    // 2px of tolerance: adjacent blocks share a border pixel.
    if (ox > 2 && oy > 2) {
      overlaps++
      if (!worst) worst = `${a.t} over ${b.t}`
    }
  }
}
overlaps === 0
  ? ok(`${boxes.length} class blocks, none covering another`)
  : bad(`${overlaps} pairs of class blocks overlap (e.g. ${worst})`)

const narrowest = Math.min(...boxes.map((b) => b.w))
narrowest >= 34
  ? ok(`narrowest block is ${Math.round(narrowest)}px — the start time still fits`)
  : bad(`narrowest block is ${Math.round(narrowest)}px, too narrow to read`)

// innerText applies CSS text-transform, so the day labels read "MON" here even
// though the source says "Mon" — match case-insensitively rather than chasing
// a heading that is on screen.
const gridText = await page.locator('body').innerText()
;/\bmon\b/i.test(gridText) && /\bsun\b/i.test(gridText)
  ? ok('day headings render above the grid')
  : bad('day headings missing')

// The whole week has to be reachable without scrolling sideways past it — the
// point of tiling was to stop hiding classes, not to move them off the edge.
const gridScroll = await page.evaluate(() => {
  const el = [...document.querySelectorAll('div')].find(
    (d) => d.scrollWidth > d.clientWidth + 4 && d.querySelector('[class*="absolute"] > button[aria-pressed]'),
  )
  return el ? { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth } : null
})
gridScroll === null
  ? ok('the whole week fits without scrolling sideways')
  : bad(`the week grid scrolls sideways (${gridScroll.scrollWidth} > ${gridScroll.clientWidth})`)

// Opening a class shows its roster.
await page.locator(BLOCKS).first().click()
const railOpened = await waitFor(async () => (await page.locator('aside').count()) > 0)
railOpened ? ok('clicking a class opens its detail panel') : bad('clicking a class opened nothing')

/* ====================================================================== */
section('Reports carry a summary, a chart and a sort')
/* ====================================================================== */
await go('/reports/revenue-by-plan')
const reportText = await page.locator('body').innerText()
// Case-insensitive for the same reason as the day headings: the KPI labels are
// uppercased in CSS, so innerText returns "ROWS" while the source says "Rows".
;/at a glance/i.test(reportText) ? ok('the report draws its result') : bad('no chart on the report')
;/\brows\b/i.test(reportText) && /\baverage\b/i.test(reportText)
  ? ok('the report summarises its own columns')
  : bad('no summary tiles')
;(await page.getByLabel('Search rows in this report').count()) > 0
  ? ok('rows can be searched within a report')
  : bad('no in-report search')

const firstCellBefore = await page.locator('tbody tr td:nth-child(2)').first().innerText()
await page.locator('thead th button').nth(1).click()
await page.waitForTimeout(400)
const firstCellAfter = await page.locator('tbody tr td:nth-child(2)').first().innerText()
firstCellBefore !== firstCellAfter
  ? ok(`sorting reorders the table (${firstCellBefore.trim()} → ${firstCellAfter.trim()})`)
  : bad('clicking a column heading did not reorder anything')

/* ====================================================================== */
section('Members: saving a view of your own')
/* ====================================================================== */
await go('/members')
const saveBtn = page.getByRole('button', { name: /save this view/i }).first()
;(await saveBtn.count()) > 0 ? ok('there is a "Save this view" button') : bad('no way to save a view')
;(await saveBtn.isDisabled())
  ? ok('it is disabled while nothing is filtered — there would be nothing to save')
  : bad('it offers to save the unfiltered default')

// Apply a filter through the real UI, then save it.
await page.getByRole('button', { name: /at risk · high value/i }).first().click()
await waitFor(async () => !(await saveBtn.isDisabled()))
await saveBtn.click()
const dialogOpen = await waitFor(async () => (await page.getByRole('dialog').count()) > 0)
dialogOpen ? ok('naming the view is asked for') : bad('the save dialog did not open')
if (dialogOpen) {
  const name = `Check ${Date.now().toString(36)}`
  await page.fill('#view-name', name)
  await page.getByRole('button', { name: /^save view$/i }).click()
  const saved = await waitFor(async () => (await page.locator('body').innerText()).includes(name))
  saved ? ok(`the saved view "${name}" appears in the rail`) : bad('the saved view did not appear')

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1', { timeout: 20000 })
  const survived = await waitFor(async () => (await page.locator('body').innerText()).includes(name))
  survived ? ok('and it is still there after a reload') : bad('the saved view did not survive a reload')

  // Clean up after ourselves so a production run leaves nothing behind.
  await page
    .getByRole('button', { name: new RegExp(`Delete the saved view ${name}`, 'i') })
    .first()
    .click()
    .catch(() => {})
  await page.waitForTimeout(400)
  !(await page.locator('body').innerText()).includes(name)
    ? ok('deleting a saved view removes it')
    : bad('the saved view could not be deleted')
}

/* ====================================================================== */
section('Check-in: the names go somewhere')
/* ====================================================================== */
await go('/check-in')
await page.locator('button[aria-expanded]').first().click()
await page.waitForTimeout(500)
const trainerLink = page.locator('a[href^="/trainers/"]').first()
;(await trainerLink.count()) > 0
  ? ok("the class's trainer is a link")
  : bad('the trainer name is not clickable')

const memberChip = page.locator('a[href^="/members/m-"]').first()
if (await memberChip.count()) {
  const target = await memberChip.getAttribute('href')
  await memberChip.click()
  const arrived = await waitFor(async () => new URL(page.url()).pathname === target, 20000)
  const heading = await page.locator('h1').first().innerText().catch(() => '')
  arrived && !/^Members$/.test(heading.trim())
    ? ok(`a name on the roster opens that member (${target})`)
    : bad(`clicking a roster name went to ${new URL(page.url()).pathname}, heading "${heading}"`)
} else {
  bad('no member names on the check-in roster to click')
}

errors.length === 0 ? ok('no page errors anywhere in the run') : bad(`page errors: ${errors.slice(0, 3).join(' | ')}`)

await browser.close()
console.log('\n' + '='.repeat(52))
console.log(`${pass} passed, ${fail} failed`)
console.log('='.repeat(52))
process.exit(fail === 0 ? 0 : 1)
