/**
 * Each sign-in door lands on its own screen, as that role.
 *
 *     node scripts/test-signin-roles.mjs [baseUrl]
 *
 * The sign-in screens live outside the app shell's React tree, so they cannot
 * set the role directly — they record it and the shell reads it back on mount.
 * That handoff is the thing worth testing: a role that fails to carry across
 * lands the trainer on the owner dashboard, or on the "this screen isn't part
 * of your role" panel, and both look like a routing bug rather than a state one.
 *
 * So each case drives the REAL form — picks the door, picks the role, fills the
 * fields, presses the button — then asserts the URL, that the no-access panel is
 * absent, and that the shell's own role indicator names the right role.
 *
 * Read-only against the app's data: signing in writes nothing but a localStorage
 * key, so this is safe to run against production.
 */

import { chromium } from 'playwright'

const BASE = process.argv[2] || 'http://localhost:8791'

const CASES = [
  { door: 'Management', role: 'Owner', landing: '/dashboard', shows: 'Owner' },
  { door: 'Management', role: 'Trainer', landing: '/my-schedule', shows: 'Trainer' },
  { door: 'Management', role: 'Front desk', landing: '/check-in', shows: 'Front desk' },
  { door: 'Member', role: null, landing: '/portal', shows: 'Member' },
]

let pass = 0, fail = 0
const ok = (m) => { console.log(`  ok   ${m}`); pass++ }
const bad = (m) => { console.log(`  FAIL ${m}`); fail++ }

const browser = await chromium.launch({ channel: 'chrome' })

for (const c of CASES) {
  // A fresh context per case: a leftover role from the previous sign-in would
  // make a broken handoff look like it worked.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(800)

  // Pick the door.
  await page.getByRole('radio', { name: `${c.door} sign in` }).click()
  await page.waitForTimeout(250)

  // Pick the staff role, where the door offers one.
  if (c.role) {
    await page.locator('label').filter({ hasText: c.role }).first().click()
    await page.waitForTimeout(150)
  }

  await page.fill('#email', 'someone@yourgym.com')
  await page.fill('#password', 'whatever')

  const button = page.locator('button[type="submit"]')
  const buttonText = (await button.innerText()).trim()
  buttonText.includes(c.shows)
    ? ok(`${c.door}${c.role ? ` / ${c.role}` : ''}: button reads "${buttonText}"`)
    : bad(`${c.door}${c.role ? ` / ${c.role}` : ''}: button reads "${buttonText}", expected ${c.shows}`)

  await button.click()
  await page.waitForURL(`**${c.landing}`, { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(2500)

  const path = new URL(page.url()).pathname
  path === c.landing ? ok(`  → lands on ${path}`) : bad(`  → landed on ${path}, expected ${c.landing}`)

  const body = await page.locator('body').innerText()
  !body.includes("isn't part of your role")
    ? ok('  → no no-access panel')
    : bad('  → hit the "not part of your role" panel')

  // The shell's role control should name the role that signed in.
  body.includes(c.shows)
    ? ok(`  → shell shows "${c.shows}"`)
    : bad(`  → shell does not show "${c.shows}"`)

  errors.length === 0 ? ok('  → no page errors') : bad(`  → ${errors.slice(0, 2).join(' | ')}`)

  await ctx.close()
}

await browser.close()
console.log('\n' + '='.repeat(50))
console.log(`${pass} passed, ${fail} failed`)
console.log('='.repeat(50))
process.exit(fail === 0 ? 0 : 1)
