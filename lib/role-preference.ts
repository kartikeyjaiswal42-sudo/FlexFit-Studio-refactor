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

function isRole(value: string | null): value is SignInRole {
  return value === 'owner' || value === 'trainer' || value === 'front_desk' || value === 'member'
}

/**
 * Both helpers swallow storage failures on purpose. Safari with cookies
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
