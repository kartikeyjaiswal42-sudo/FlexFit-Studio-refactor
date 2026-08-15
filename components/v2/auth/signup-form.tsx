'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/v2/ui/button'
import { Checkbox } from '@/components/v2/ui/checkbox'
import { Input } from '@/components/v2/ui/input'
import { Label } from '@/components/v2/ui/label'
import { ROLE_LANDING, rememberRole } from '@/lib/role-preference'
import { registerAccount } from '@/lib/account-store'
import { cn } from '@/lib/v2/utils'

interface FieldErrors {
  name?: string
  gym?: string
  email?: string
  password?: string
  terms?: string
}

/** Coarse password strength, used only to give the user feedback as they type. */
function scorePassword(value: string): { score: number; label: string } {
  let score = 0
  if (value.length >= 8) score += 1
  if (value.length >= 12) score += 1
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1
  if (/\d/.test(value) || /[^A-Za-z0-9]/.test(value)) score += 1

  const labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong']
  return { score, label: labels[score] }
}

/**
 * Account creation form.
 *
 * Everyone who signs up here becomes a **member** and lands in the member
 * portal. Staff accounts are issued by the studio, not claimed from a public
 * form — sending a self-registered account to the owner dashboard would hand
 * the back office, and 380 people's contact and payment records, to anybody who
 * filled in four fields.
 *
 * Same contract as the login form otherwise: validate here, then hand off to the
 * tRPC `auth.signUp` mutation when the backend lands.
 */
export function SignupForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [gym, setGym] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [pending, setPending] = useState(false)

  const strength = useMemo(() => scorePassword(password), [password])

  function validate(): FieldErrors {
    const next: FieldErrors = {}
    if (!name.trim()) next.name = 'Enter your full name.'
    if (!gym.trim()) next.gym = 'Enter the gym or studio you train at.'
    if (!email.trim()) {
      next.email = 'Enter your email.'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = 'That email address looks incomplete.'
    }
    if (password.length < 8) {
      next.password = 'Use at least 8 characters.'
    }
    if (!accepted) {
      next.terms = 'Please accept the terms to continue.'
    }
    return next
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setPending(true)
    await new Promise((resolve) => setTimeout(resolve, 600))
    // Remember the registration so this person can sign back in with the name
    // they just typed, not only the address (see lib/account-store.ts).
    registerAccount(name, email)
    // Setting the role explicitly also clears whatever was left over from a
    // previous sign-in on this browser — otherwise somebody who signed up right
    // after an owner demo would be dropped into the back office.
    rememberRole('member')
    router.push(ROLE_LANDING.member)
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="name" className="text-sm">
            Full name
          </Label>
          <Input
            id="name"
            name="name"
            autoComplete="name"
            placeholder="Priya Nair"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'name-error' : undefined}
            className="h-11 bg-card"
          />
          {errors.name && (
            <p id="name-error" role="alert" className="text-xs text-destructive">
              {errors.name}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="gym" className="text-sm">
            Your gym
          </Label>
          <Input
            id="gym"
            name="gym"
            autoComplete="organization"
            placeholder="Riverside"
            value={gym}
            onChange={(event) => setGym(event.target.value)}
            aria-invalid={Boolean(errors.gym)}
            aria-describedby={errors.gym ? 'gym-error' : undefined}
            className="h-11 bg-card"
          />
          {errors.gym && (
            <p id="gym-error" role="alert" className="text-xs text-destructive">
              {errors.gym}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="signup-email" className="text-sm">
          Email
        </Label>
        <Input
          id="signup-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@yourgym.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? 'signup-email-error' : undefined}
          className="h-11 bg-card"
        />
        {errors.email && (
          <p id="signup-email-error" role="alert" className="text-xs text-destructive">
            {errors.email}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="signup-password" className="text-sm">
          Password
        </Label>
        <div className="relative">
          <Input
            id="signup-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(errors.password)}
            aria-describedby="password-strength"
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

        <div className="flex items-center gap-2.5" id="password-strength">
          <div className="flex flex-1 gap-1" aria-hidden="true">
            {[0, 1, 2, 3].map((index) => (
              <span
                key={index}
                className={cn(
                  'h-1 flex-1 rounded-full transition-colors',
                  index < strength.score ? 'bg-brand' : 'bg-secondary',
                )}
              />
            ))}
          </div>
          <span className="w-16 text-right text-xs text-muted-foreground">
            {password ? strength.label : ''}
          </span>
        </div>

        {errors.password && (
          <p role="alert" className="text-xs text-destructive">
            {errors.password}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-2.5">
          <Checkbox
            id="terms"
            name="terms"
            checked={accepted}
            onCheckedChange={(checked) => setAccepted(checked === true)}
            aria-describedby={errors.terms ? 'terms-error' : undefined}
            className="mt-0.5"
          />
          <Label
            htmlFor="terms"
            className="text-sm leading-relaxed font-normal text-muted-foreground"
          >
            I agree to the{' '}
            <Link href="#" className="text-brand hover:text-brand/80">
              terms of service
            </Link>{' '}
            and{' '}
            <Link href="#" className="text-brand hover:text-brand/80">
              privacy policy
            </Link>
            .
          </Label>
        </div>
        {errors.terms && (
          <p id="terms-error" role="alert" className="text-xs text-destructive">
            {errors.terms}
          </p>
        )}
      </div>

      <Button
        type="submit"
        disabled={pending}
        className="h-11 w-full rounded-full bg-brand text-sm text-white hover:bg-brand/90"
      >
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Creating account
          </>
        ) : (
          'Create account'
        )}
      </Button>

      <p className="rounded-xl border border-border bg-card p-3 text-xs leading-relaxed text-muted-foreground">
        This creates a <strong className="font-medium text-foreground">member</strong> account and
        opens your portal. Next time you can sign in with either this email or the name you just
        entered.
      </p>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-brand hover:text-brand/80">
          Sign in
        </Link>
      </p>
    </form>
  )
}
