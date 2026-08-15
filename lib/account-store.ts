/**
 * Accounts created through the sign-up form, kept on the device that made them.
 *
 * Sign-up has no server behind it, so there is nowhere central to put an
 * account. What it can honestly do is remember, in this browser, that somebody
 * registered — which is what makes "sign in with the name I just used" work
 * instead of silently accepting anything typed into the field.
 *
 * Everyone who signs up here is a **member**. Staff accounts are created by the
 * studio, not by a public form, so a self-registered account that landed on the
 * owner dashboard would be handing out the back office to anyone who filled in
 * four fields.
 *
 * Like lib/role-preference.ts this module has no imports and no `"use client"`
 * directive: a constant exported from a client module resolves to a client
 * reference stub the moment anything server-side touches it.
 */

export interface RegisteredAccount {
  name: string
  email: string
  /** ISO timestamp, shown on the sign-in screen so the account is recognisable. */
  registeredAt: string
}

export const ACCOUNTS_STORAGE_KEY = 'flexfit_accounts'

function readRaw(): RegisteredAccount[] {
  try {
    const stored = window.localStorage.getItem(ACCOUNTS_STORAGE_KEY)
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (a): a is RegisteredAccount =>
        typeof a === 'object' &&
        a !== null &&
        typeof (a as RegisteredAccount).name === 'string' &&
        typeof (a as RegisteredAccount).email === 'string',
    )
  } catch {
    // Storage blocked, or somebody hand-edited the key into invalid JSON.
    // Either way an empty list is the safe answer: the form still works, it
    // just cannot recognise a previous registration.
    return []
  }
}

export function readAccounts(): RegisteredAccount[] {
  return readRaw()
}

/**
 * Record a registration. Re-registering the same address updates the name
 * rather than adding a second row, so signing up twice cannot produce two
 * accounts that both answer to the same email.
 */
export function registerAccount(name: string, email: string): RegisteredAccount {
  const account: RegisteredAccount = {
    name: name.trim(),
    email: email.trim().toLowerCase(),
    registeredAt: new Date().toISOString(),
  }
  try {
    const others = readRaw().filter((a) => a.email.toLowerCase() !== account.email)
    window.localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify([...others, account]))
  } catch {
    /* the sign-up still completes; it just will not be remembered next visit */
  }
  return account
}

/**
 * Find an account by **either** the email or the name it was registered with.
 *
 * Matching on the name is the point: people remember the name they typed far
 * better than which address they used, and the sign-in field accepts both.
 * Names are not unique in general, so the most recent registration wins — the
 * one somebody is most likely to have just made.
 */
export function findAccount(identifier: string): RegisteredAccount | null {
  const needle = identifier.trim().toLowerCase()
  if (!needle) return null
  const accounts = readRaw()
  for (let i = accounts.length - 1; i >= 0; i -= 1) {
    const account = accounts[i]
    if (account.email.toLowerCase() === needle || account.name.toLowerCase() === needle) {
      return account
    }
  }
  return null
}
