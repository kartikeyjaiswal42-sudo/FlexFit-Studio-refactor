/**
 * Which role signed in, and where that role belongs.
 *
 * The sign-in screens live outside the app shell, so they cannot call
 * `setRole` on the provider — they are a different React tree. They record the
 * choice here instead, and `AppProvider` picks it up when the shell mounts.
 *
 * This module deliberately has no imports and no `"use client"` directive. The
 * role list is needed by a client form AND by the provider, and a constant
 * exported from a `"use client"` module resolves to a client-reference stub
 * when anything server-side touches it — the same trap that made every token
 * check 500 in the bingo project. A neutral module cannot be caught by it.
 */

export type SignInRole = 'owner' | 'trainer' | 'front_desk' | 'member'

export const ROLE_STORAGE_KEY = 'flexfit_role'

/**
 * Where each role lands after signing in. These mirror `ROLES[].landing` in
 * components/shell/role-context.tsx — a role sent to a screen its permissions
 * exclude would arrive on the "this screen isn't part of your role" panel.
 */
export const ROLE_LANDING: Record<SignInRole, string> = {
  owner: '/dashboard',
  trainer: '/my-schedule',
  front_desk: '/check-in',
  member: '/portal',
}

/** The three roles behind the management sign-in, in seniority order. */
export const MANAGEMENT_ROLES: { id: SignInRole; label: string; blurb: string }[] = [
  { id: 'owner', label: 'Owner', blurb: 'Revenue, retention and every location' },
  { id: 'trainer', label: 'Trainer', blurb: 'Your classes, clients and schedule' },
  { id: 'front_desk', label: 'Front desk', blurb: 'Check-ins, leads and the kiosk' },
]

export interface DemoAccount {
  email: string
  password: string
  /** The seeded person this account signs you in as. */
  person: string
  label: string
}

/**
 * A ready-made account per role, filled into the sign-in form automatically.
 *
 * Somebody evaluating this app has four screens to look at and no reason to own
 * four sets of credentials. Leaving the fields empty makes them invent an email
 * before they can see anything, which is friction in front of the one thing
 * they came to do. The addresses match the seeded staff in
 * components/shell/role-context.tsx, so the name on the account and the name in
 * the top bar are the same person.
 *
 * These are demonstration accounts, not a security boundary — nothing here
 * authenticates. See the note on the sign-in screen, which says so plainly
 * rather than implying a password check that does not exist.
 */
export const DEMO_ACCOUNTS: Record<SignInRole, DemoAccount> = {
  owner: {
    email: 'dana.okonkwo@flexfitstudio.in',
    password: 'flexfit-demo',
    person: 'Dana Okonkwo',
    label: 'Owner',
  },
  trainer: {
    email: 'priya.raghunathan@flexfitstudio.in',
    password: 'flexfit-demo',
    person: 'Priya Raghunathan',
    label: 'Trainer',
  },
  front_desk: {
    email: 'marco.silveira@flexfitstudio.in',
    password: 'flexfit-demo',
    person: 'Marco Silveira',
    label: 'Front desk',
  },
  member: {
    email: 'tomas.lindqvist@example.com',
    password: 'flexfit-demo',
    person: 'Tomas Lindqvist',
    label: 'Member',
  },
}

const DEMO_EMAILS = new Set(Object.values(DEMO_ACCOUNTS).map((a) => a.email.toLowerCase()))

/**
 * True when the field still holds a filled-in demo address.
 *
 * The form swaps the credentials as you change role, but only over its own
 * suggestion — the moment somebody types their own address, switching role must
 * not throw it away.
 */
export function isDemoEmail(value: string): boolean {
  return DEMO_EMAILS.has(value.trim().toLowerCase())
}

function isRole(value: string | null): value is SignInRole {
  return value === 'owner' || value === 'trainer' || value === 'front_desk' || value === 'member'
}

/**
 * All three helpers swallow storage failures on purpose. Safari with cookies
 * blocked, and in-app webviews, THROW on localStorage access rather than
 * returning null — unguarded, that took the whole app down in an earlier
 * project. Losing the remembered role is survivable; a dead page is not.
 */
export function rememberRole(role: SignInRole): void {
  try {
    window.localStorage.setItem(ROLE_STORAGE_KEY, role)
  } catch {
    /* storage unavailable — the session just falls back to the default role */
  }
}

export function readRememberedRole(): SignInRole | null {
  try {
    const stored = window.localStorage.getItem(ROLE_STORAGE_KEY)
    return isRole(stored) ? stored : null
  } catch {
    return null
  }
}

/** Sign out: forget the role so the next visit starts at the sign-in screen. */
export function forgetRole(): void {
  try {
    window.localStorage.removeItem(ROLE_STORAGE_KEY)
  } catch {
    /* nothing to forget if storage was never readable */
  }
}
