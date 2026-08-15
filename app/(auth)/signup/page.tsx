import type { Metadata } from 'next'
import { AuthShell } from '@/components/v2/auth/auth-shell'
import { SignupForm } from '@/components/v2/auth/signup-form'

export const metadata: Metadata = {
  title: 'Create your account',
  description: 'Create a FlexFit Studio member account — bookings, plan and visit history.',
}

export default function SignupPage() {
  return (
    <AuthShell
      // Sign-up creates a MEMBER account (see signup-form.tsx), so the heading
      // says so. Promising a trial of the whole product and then landing in the
      // member portal is the kind of mismatch that reads as a broken button.
      title="Create your member account"
      subtitle="Book classes, track your visits and manage your plan. Staff accounts are issued by your studio."
      aside={{
        quote:
          'The check-in grid changed how we roster. We could finally see the 6pm crush for what it was and staff around it.',
        attribution: 'Marcus Hale — Operations, Northgate Athletic',
      }}
      image={{
        src: '/images/gym-ropes.jpg',
        alt: 'An athlete training with battle ropes on a covered rooftop',
      }}
    >
      <SignupForm />
    </AuthShell>
  )
}
