'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Eye, EyeOff, Loader2, Wand2 } from 'lucide-react'
import { Button } from '@/components/v2/ui/button'
import { Checkbox } from '@/components/v2/ui/checkbox'
import { Input } from '@/components/v2/ui/input'
import { Label } from '@/components/v2/ui/label'
import { cn } from '@/lib/utils'
import {
  DEMO_ACCOUNTS,
  MANAGEMENT_ROLES,
  ROLE_LANDING,
  isDemoEmail,
  rememberRole,
  type SignInRole,
} from '@/lib/role-preference'
import { findAccount } from '@/lib/account-store'

interface FieldErrors {
  email?: string
  password?: string
}

/**
 * Sign-in form.
 *
 * Two doors, because the two audiences want opposite things: staff want the
 * workspace, members want their own account. The management door then asks
 * WHICH staff — owner, trainer or front desk — because each has a different
 * home screen and sees a different subset of the app, and landing on somebody
 * else's screen is the same as landing nowhere.
 *
 * The chosen role is recorded before navigating (see lib/role-preference.ts).
 * These screens sit outside the app shell's React tree, so they cannot call
 * `setRole` directly; the shell reads the choice back when it mounts.
 *
 * The credentials for the chosen role are filled in automatically, so anyone
 * evaluating the app can open any of the four screens without first inventing
 * an account. Typing over them stops the swap — see `isDemoEmail`.
 *
 * Validation is client-side only. The submit handler is the single place to
 * swap in the real sign-in mutation once one exists — the field state, error
 * rendering and pending UI all stay as they are.
 */
export function LoginForm() {
  const router = useRouter()
  /**
   * Management is the default door, with the owner account already filled in.
   *
   * Whoever opens this app is here to look at the studio it runs, so the first
   * screen offered is the one that shows it. Member sign in is one tap away and
   * keeps its own filled-in account — these three lines are the whole switch,
   * nothing else depends on which door starts open.
   */
  const [audience, setAudience] = useState<'management' | 'member'>('management')
  const [staffRole, setStaffRole] = useState<SignInRole>('owner')
  const [email, setEmail] = useState(DEMO_ACCOUNTS.owner.email)
  const [password, setPassword] = useState(DEMO_ACCOUNTS.owner.password)
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [pending, setPending] = useState(false)

  const role: SignInRole = audience === 'member' ? 'member' : staffRole
  const roleLabel =
    audience === 'member'
      ? 'Member'
      : (MANAGEMENT_ROLES.find((r) => r.id === staffRole)?.label ?? 'Owner')
  const demo = DEMO_ACCOUNTS[role]

  /** An account created through sign-up on this device, matched by name or email. */
  const registered = audience === 'member' ? findAccount(email) : null

  /**
   * Follow the chosen role with the matching demo credentials — but only while
   * the field still holds a suggestion. Once somebody types their own address
   * (or the name they signed up with) switching role must leave it alone.
   */
  useEffect(() => {
    setEmail((current) => (current.trim() === '' || isDemoEmail(current) ? demo.email : current))
    setPassword((current) => (current === '' || current === demo.password ? demo.password : current))
  }, [demo])

  function validate(): FieldErrors {
    const next: FieldErrors = {}
    const identifier = email.trim()
    if (!identifier) {
      next.email = audience === 'member' ? 'Enter your email or name.' : 'Enter your work email.'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) {
      // The member door accepts the name somebody signed up with, so a value
      // without an "@" is only wrong here if no account answers to it.
      if (audience !== 'member') {
        next.email = 'That email address looks incomplete.'
      } else if (!findAccount(identifier)) {
        next.email = `No account on this device is registered to “${identifier}”. Use the email address, or create an account.`
      }
    }
    if (!password) {
      next.password = 'Enter your password.'
    }
    return next
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setPending(true)
    // Placeholder for the real mutation; keeps the pending state observable.
    await new Promise((resolve) => setTimeout(resolve, 600))
    // Record the role BEFORE navigating: the app shell reads it as it mounts,
    // so writing it after the push would be one frame too late.
    rememberRole(role)
    router.push(ROLE_LANDING[role])
  }

  function fillDemo() {
    setEmail(demo.email)
    setPassword(demo.password)
    setErrors({})
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {/* Which door: staff workspace, or a member's own account. */}
      <div
        role="radiogroup"
        aria-label="Who is signing in"
        className="grid grid-cols-2 gap-1 rounded-full bg-secondary p-1"
      >
        {(
          [
            ['management', 'Management'],
            ['member', 'Member'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={audience === id}
            onClick={() => setAudience(id)}
            className={cn(
              'rounded-full px-4 py-2 text-sm font-medium transition-colors',
              audience === id
                ? 'bg-card text-foreground shadow-[0_1px_3px_rgb(20_22_26_/_0.12)]'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label} sign in
          </button>
        ))}
      </div>

      {audience === 'management' ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Sign in as</legend>
          <div className="flex flex-col gap-2">
            {MANAGEMENT_ROLES.map((option) => (
              <label
                key={option.id}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
                  staffRole === option.id
                    ? 'border-brand bg-brand-soft'
                    : 'border-border bg-card hover:border-brand/40',
                )}
              >
                <input
                  type="radio"
                  name="staff-role"
                  value={option.id}
                  checked={staffRole === option.id}
                  onChange={() => setStaffRole(option.id)}
                  className="mt-0.5 size-4 accent-[var(--brand)]"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium leading-none">{option.label}</span>
                  <span className="text-xs text-muted-foreground">{option.blurb}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <p className="rounded-xl border border-border bg-card p-3 text-xs leading-relaxed text-muted-foreground">
          Members sign in to their own portal — bookings, plan and visit history.
          Staff should use <strong className="font-medium text-foreground">Management sign in</strong>.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email" className="text-sm">
          {audience === 'member' ? 'Email or name' : 'Work email'}
        </Label>
        <Input
          id="email"
          name="email"
          // Not type="email" on the member door: the field accepts the name
          // somebody signed up with, and the browser's own validation would
          // reject that before this form ever saw it.
          type={audience === 'member' ? 'text' : 'email'}
          autoComplete={audience === 'member' ? 'username' : 'email'}
          placeholder={audience === 'member' ? 'you@example.com or your name' : 'you@yourgym.com'}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? 'email-error' : undefined}
          className="h-11 bg-card"
        />
        {errors.email && (
          <p id="email-error" role="alert" className="text-xs text-destructive">
            {errors.email}
          </p>
        )}
        {!errors.email && registered && (
          <p className="text-xs text-muted-foreground">
            Signing in as{' '}
            <strong className="font-medium text-foreground">{registered.name}</strong> — the account
            created on this device.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password" className="text-sm">
            Password
          </Label>
          <Link
            href="/forgot-password"
            className="text-xs text-brand transition-colors hover:text-brand/80"
          >
            Forgot password?
          </Link>
        </div>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? 'password-error' : undefined}
            className="h-11 bg-card pr-11"
          />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <EyeOff className="size-4" aria-hidden="true" />
            ) : (
              <Eye className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>
        {errors.password && (
          <p id="password-error" role="alert" className="text-xs text-destructive">
            {errors.password}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2.5">
        <Checkbox id="remember" name="remember" defaultChecked />
        <Label htmlFor="remember" className="text-sm font-normal text-muted-foreground">
          Keep me signed in on this device
        </Label>
      </div>

      {/* The demo account is filled in already; this says so, names whose
          account it is, and offers to put it back if the fields were edited.
          It also states plainly that nothing is checked, rather than letting the
          password box imply a check that no code performs. */}
      <div className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-secondary/40 p-3">
        <Wand2 className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
        <div className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
          <p>
            <strong className="font-medium text-foreground">Demo account ready</strong> —{' '}
            {demo.person} · {demo.email}. Press{' '}
            <span className="font-medium text-foreground">Sign in as {roleLabel}</span> to go
            straight in; this build accepts any credentials.
          </p>
          <button
            type="button"
            onClick={fillDemo}
            className="mt-1 font-medium text-brand underline-offset-2 hover:underline"
          >
            Refill the {roleLabel.toLowerCase()} account
          </button>
        </div>
      </div>

      <Button
        type="submit"
        disabled={pending}
        className="h-11 w-full rounded-full bg-brand text-sm text-white hover:bg-brand/90"
      >
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Signing in
          </>
        ) : (
            `Sign in as ${roleLabel}`
        )}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        New to FlexFit?{' '}
        <Link href="/signup" className="font-medium text-brand hover:text-brand/80">
          Create an account
        </Link>
      </p>
    </form>
  )
}
