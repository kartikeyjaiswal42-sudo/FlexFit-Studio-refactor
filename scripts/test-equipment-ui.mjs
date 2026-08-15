/**
 * Real-browser pass over everything this change set touched.
 *
 *     node scripts/test-equipment-ui.mjs [baseUrl]
 *
 * It drives the actual product rather than checking that components render:
 * switch role, press the button, and then assert the DATABASE moved and the
 * screen behind the toast moved with it. That is the whole point — the defect
 * being fixed was buttons that showed a success toast over a change that never
 * happened, which every render test in the world would have passed.
 *
 * Two habits this suite is built around, both learned the hard way elsewhere in
 * this workspace:
 *   - never a fixed `sleep()`; always wait for the condition, because a fixed
 *     wait racing a server round trip false-flags bugs that are not there.
 *   - a Playwright click can land before React hydrates and Playwright is
 *     perfectly happy, so interactions retry until the effect is observable.
 *
 * One trap worth naming, because it cost a round of false failures here:
 * **`innerText` applies CSS `text-transform`.** Column headers and KPI labels in
 * this app are `uppercase`, so `innerText` returns "S.NO" and "BOOK VALUE" while
 * the source says "S.no" and "Book value". A case-sensitive `includes()` reports
 * a missing column that is right there on screen. Match case-insensitively, or
 * read `textContent`.
 */
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'http://127.0.0.1:8787'

let pass = 0
let fail = 0
const failures = []
const consoleErrors = []

function check(label, ok, detail = '') {
  if (ok) {
    pass += 1
    console.log(`  ok   ${label}`)
  } else {
    fail += 1
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`)
    console.log(` FAIL  ${label}${detail ? `\n         ${detail}` : ''}`)
  }
}

function section(name) {
  console.log(`\n${name}\n${'-'.repeat(name.length)}`)
}

async function api(path, body) {
  const res = await fetch(`${BASE}/api/trpc/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json()
  if (json.error) throw new Error(json.error.message)
  return json.result.data
}

const ROLE_IDS = { Owner: 'owner', Trainer: 'trainer', 'Front desk': 'front_desk', Member: 'member' }

/**
 * Become a different role.
 *
 * There is no longer a role SWITCHER in the top bar — it was removed because it
 * let a member read the owner's navigation off a dropdown and walk into it. The
 * role now comes from signing in, which records it in localStorage under
 * `flexfit_role` and is read back by AppProvider on mount.
 *
 * So this writes the same key the sign-in screen writes and reloads, which is
 * the real mechanism rather than a test-only back door. It then confirms the
 * shell agrees, because trusting the write is how you get a test that passes
 * against a broken handoff.
 */
async function setRole(page, label) {
  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key, value),
    ['flexfit_role', ROLE_IDS[label]],
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1', { timeout: 20000 })
  const trigger = page.locator('button[aria-label^="Signed in as"]').first()
  for (let i = 0; i < 25; i++) {
    if (new RegExp(label, 'i').test(await trigger.innerText().catch(() => ''))) return true
    await page.waitForTimeout(200)
  }
  return false
}

/** Wait for a condition on freshly-read page text. Never a fixed sleep. */
async function waitForText(page, selectorOrNull, re, timeoutMs = 12000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const t = selectorOrNull
      ? await page.locator(selectorOrNull).first().innerText().catch(() => '')
      : await page.locator('body').innerText().catch(() => '')
    if (re.test(t)) return t
    await page.waitForTimeout(250)
  }
  return null
}

const browser = await chromium.launch({ channel: 'chrome' })

try {
  /* ===================================================================== */
  section('Equipment screen — owner')
  /* ===================================================================== */
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))

  await page.goto(`${BASE}/equipment`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1', { timeout: 20000 })

  check('/equipment renders a heading', (await page.locator('h1').first().innerText()).includes('Equipment'))

  // Wait for hydration to replace the seed with the database's copy.
  await page.waitForFunction(() => !document.body.innerText.includes('Working from the built-in sample data'), {
    timeout: 20000,
  }).catch(() => {})

  // Case-insensitive: these labels render uppercase via CSS.
  check('owner sees the asset register KPIs', Boolean(await waitForText(page, null, /book value/i)) && /maintenance/i.test(await page.locator('body').innerText()))
  check('owner sees the register table', /asset register/i.test(await page.locator('body').innerText()))
  check('register shows an S.no column', /s\.no/i.test(await page.locator('body').innerText()))

  const rowCount = await page.locator('table tbody tr').count()
  check('register has rows', rowCount > 10, `rows=${rowCount}`)

  // The first data row's serial cell must read "1".
  const firstSerial = await page.locator('table tbody tr').first().locator('td').first().innerText()
  check('first row S.no reads 1', firstSerial.trim() === '1', `got "${firstSerial.trim()}"`)

  const noHScroll = await page.evaluate(() => {
    window.scrollTo(100, 0)
    const moved = window.scrollX > 0
    window.scrollTo(0, 0)
    return !moved
  })
  check('no horizontal page scroll at 1440px', noHScroll)

  /* ===================================================================== */
  section('Equipment — take an asset off the floor, and check D1 moved')
  /* ===================================================================== */
  const before = await api('read.bootstrap')
  const target = before.equipment.find((e) => e.status === 'in-service' && !e.bookable)
  check('found an in-service asset to act on', Boolean(target), target?.assetTag)

  if (target) {
    // Filter to that asset so the button we press is unambiguous.
    const row = page.locator('table tbody tr', { hasText: target.assetTag }).first()
    await row.scrollIntoViewIfNeeded().catch(() => {})
    const btn = row.getByRole('button', { name: /take off floor/i }).first()

    let clicked = false
    for (let i = 0; i < 10 && !clicked; i++) {
      if (await btn.count()) {
        await btn.click().catch(() => {})
        clicked = true
      } else {
        await page.waitForTimeout(300)
      }
    }
    check('“Take off floor” button is present and clickable', clicked)

    if (clicked) {
      // Assert the DATABASE changed, not that a toast appeared.
      let persisted = false
      for (let i = 0; i < 30; i++) {
        const now = await api('read.bootstrap')
        if (now.equipment.find((e) => e.id === target.id)?.status === 'out-of-service') {
          persisted = true
          break
        }
        await page.waitForTimeout(400)
      }
      check('status change PERSISTED to D1 (survives reload)', persisted)

      // And the screen behind the toast shows it. Polled, because the store's
      // re-read finishes a beat after the write the API poll above observed —
      // reading once at that instant tests the race, not the behaviour.
      const shows = await waitForText(
        page,
        `table tbody tr:has-text("${target.assetTag}")`,
        /out of service/i,
      )
      check('the row on screen now reads Out of service', shows !== null, 'row never showed the new status')

      // Put it back so the suite is re-runnable.
      await api('equipment.setStatus', { id: target.id, status: 'in-service' })
    }
  }

  /* ===================================================================== */
  section('Trainers — the Active/Inactive toggle')
  /* ===================================================================== */
  await page.goto(`${BASE}/trainers`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('table tbody tr', { timeout: 20000 })

  check('trainers roster shows an S.no column', /s\.no/i.test(await page.locator('body').innerText()))

  const staffBefore = (await api('read.bootstrap')).staff
  const victim = staffBefore.find((s) => s.role === 'trainer' && s.active)
  check('found an active trainer', Boolean(victim), victim?.name)

  if (victim) {
    const trow = page.locator('table tbody tr', { hasText: victim.name }).first()
    const deact = trow.getByRole('button', { name: new RegExp(`deactivate ${victim.name}`, 'i') }).first()

    let opened = false
    for (let i = 0; i < 10 && !opened; i++) {
      if (await deact.count()) {
        await deact.click().catch(() => {})
        opened = Boolean(await page.getByRole('dialog').count())
      }
      if (!opened) await page.waitForTimeout(300)
    }
    check('Deactivate opens a confirmation dialog', opened)

    if (opened) {
      const dlgText = await page.getByRole('dialog').innerText()
      check(
        'dialog states that classes/clients are NOT reassigned',
        /not reassigned/i.test(dlgText),
        dlgText.slice(0, 120),
      )

      await page.getByRole('dialog').getByRole('button', { name: /mark inactive/i }).click()

      let flipped = false
      for (let i = 0; i < 30; i++) {
        const s = (await api('read.bootstrap')).staff.find((x) => x.id === victim.id)
        if (s && !s.active && s.activeTo) {
          flipped = true
          break
        }
        await page.waitForTimeout(400)
      }
      check('trainer active flag PERSISTED to D1', flipped)

      const after = (await api('read.bootstrap')).staff.find((x) => x.id === victim.id)
      check('active=false and activeTo are written together', after && !after.active && Boolean(after.activeTo))

      // The header count must move with the chip — the bug this guards is a
      // chip that flips while the totals above it stay put.
      const headerNow = await page.locator('body').innerText()
      const activeCount = staffBefore.filter((s) => s.role === 'trainer' && s.active).length
      check(
        `roster header recounted to ${activeCount - 1} active`,
        headerNow.includes(`${activeCount - 1} active`),
        `looking for "${activeCount - 1} active"`,
      )

      await api('ops.setStaffActive', { staffId: victim.id, active: true })
    }
  }

  /* ===================================================================== */
  section('Member profile — Freeze and Take payment')
  /* ===================================================================== */
  const liveMember = (await api('read.bootstrap')).members.find((m) => m.status === 'active')
  await page.goto(`${BASE}/members/${liveMember.id}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1', { timeout: 20000 })

  const freezeBtn = page.getByRole('button', { name: /^freeze$/i }).first()
  let froze = false
  for (let i = 0; i < 10 && !froze; i++) {
    if (await freezeBtn.count()) {
      await freezeBtn.click().catch(() => {})
      froze = Boolean(await page.getByRole('dialog').count())
    }
    if (!froze) await page.waitForTimeout(300)
  }
  check('Freeze opens a dialog stating the consequence', froze)

  if (froze) {
    const d = await page.getByRole('dialog').innerText()
    check('dialog quotes the revenue being paused', /paused/i.test(d))
    await page.getByRole('dialog').getByRole('button', { name: /freeze membership/i }).click()

    let frozen = false
    for (let i = 0; i < 30; i++) {
      const m = (await api('read.bootstrap')).members.find((x) => x.id === liveMember.id)
      if (m?.status === 'frozen') {
        frozen = true
        break
      }
      await page.waitForTimeout(400)
    }
    check('freeze PERSISTED to D1', frozen)

    // The button must now offer the opposite action rather than "Freeze" again.
    let flipped = false
    for (let i = 0; i < 20; i++) {
      if (await page.getByRole('button', { name: /reactivate/i }).count()) {
        flipped = true
        break
      }
      await page.waitForTimeout(300)
    }
    check('the button becomes “Reactivate” once frozen', flipped)

    await api('ops.setMemberStatus', { memberId: liveMember.id, status: 'active' })
  }

  const payBefore = (await api('read.bootstrap')).payments.length
  const payBtn = page.getByRole('button', { name: /take payment/i }).first()
  let payOpen = false
  for (let i = 0; i < 10 && !payOpen; i++) {
    if (await payBtn.count()) {
      await payBtn.click().catch(() => {})
      payOpen = Boolean(await page.getByRole('dialog').count())
    }
    if (!payOpen) await page.waitForTimeout(300)
  }
  check('Take payment opens a dialog', payOpen)

  if (payOpen) {
    await page.getByRole('dialog').getByRole('button', { name: /^take /i }).click()
    let added = false
    for (let i = 0; i < 30; i++) {
      if ((await api('read.bootstrap')).payments.length === payBefore + 1) {
        added = true
        break
      }
      await page.waitForTimeout(400)
    }
    check('payment APPENDED a ledger row in D1', added)
  }

  /* ===================================================================== */
  section('Settings — Save changes, and the Email tab')
  /* ===================================================================== */
  await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1', { timeout: 20000 })

  await page.getByRole('tab', { name: /booking policy/i }).click().catch(async () => {
    await page.getByRole('button', { name: /booking policy/i }).click()
  })
  const cancelInput = page.locator('#p-cancel')
  await cancelInput.waitFor({ timeout: 10000 })
  await cancelInput.fill('21')

  const saveBtn = page.getByRole('button', { name: /save/i }).first()
  await saveBtn.click()

  let saved = false
  for (let i = 0; i < 30; i++) {
    const s = (await api('read.bootstrap')).settings
    if (Number(s['booking.cancelWindowHours']) === 21) {
      saved = true
      break
    }
    await page.waitForTimeout(400)
  }
  check('“Save changes” PERSISTED the setting to D1', saved)
  await api('ops.saveSetting', { key: 'booking.cancelWindowHours', value: 12 })

  await page.getByRole('tab', { name: /^email$/i }).click().catch(async () => {
    await page.getByRole('button', { name: /^email$/i }).click()
  })
  await page.waitForTimeout(600)
  const emailText = await page.locator('body').innerText()
  check('Email tab reports configuration state', /outbound email/i.test(emailText))
  check(
    'unconfigured mail is stated plainly, not hidden',
    /not configured|RESEND_API_KEY/i.test(emailText),
    emailText.slice(0, 140),
  )

  /* ===================================================================== */
  section('Equipment — trainer and member views')
  /* ===================================================================== */
  await page.goto(`${BASE}/equipment`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1', { timeout: 20000 })

  const gotTrainer = await setRole(page, 'Trainer')
  check('role switched to Trainer', gotTrainer)
  if (gotTrainer) {
    await page.waitForTimeout(900)
    const t = await page.locator('body').innerText()
    check('trainer sees a Report fault action', /report fault/i.test(t))
    check('trainer view is scoped to their floor', /assets on your floor/i.test(t), t.slice(0, 120))
  }

  const gotMember = await setRole(page, 'Member')
  check('role switched to Member', gotMember)
  if (gotMember) {
    await page.waitForTimeout(900)
    const m = await page.locator('body').innerText()
    check('member sees their bookings section', /your bookings/i.test(m))
    check('member sees reservable equipment', /reservable/i.test(m))
    check('member can report a problem', /report a problem/i.test(m))
  }

  /* ===================================================================== */
  section('390px phone pass')
  /* ===================================================================== */
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const p2 = await phone.newPage()
  p2.on('pageerror', (e) => consoleErrors.push(`pageerror(390): ${e.message}`))

  for (const route of ['/equipment', '/trainers', '/settings']) {
    await p2.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' })
    await p2.waitForSelector('h1', { timeout: 20000 })
    const panned = await p2.evaluate(() => {
      window.scrollTo(200, 0)
      const moved = window.scrollX > 0
      window.scrollTo(0, 0)
      return moved
    })
    check(`${route} does not scroll sideways at 390px`, !panned)
  }
  await phone.close()

  /* ===================================================================== */
  section('Console')
  /* ===================================================================== */
  const realErrors = consoleErrors.filter(
    (e) => !/favicon|Failed to load resource.*404|Download the React DevTools/i.test(e),
  )
  check('no console errors', realErrors.length === 0, realErrors.slice(0, 3).join(' | '))

  await ctx.close()
} finally {
  await browser.close()
}

console.log(`\n${'='.repeat(60)}`)
console.log(`${pass} passed, ${fail} failed`)
if (fail > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  · ${f}`)
}
console.log('='.repeat(60))
process.exit(fail > 0 ? 1 : 0)
