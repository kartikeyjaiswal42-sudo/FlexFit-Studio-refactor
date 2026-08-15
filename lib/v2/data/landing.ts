/**
 * Landing page copy and content blocks.
 *
 * Kept out of the components so marketing copy can be edited (or later moved
 * to a CMS) without touching layout or motion code.
 */

import type { Feature, Plan, Testimonial } from '@/lib/v2/domain/types'

export const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'Workflow', href: '#workflow' },
  { label: 'Results', href: '#results' },
  { label: 'Pricing', href: '#pricing' },
]

export const HERO = {
  eyebrow: 'Gym management, quietly handled',
  titleLead: 'Run the floor,',
  titleTrail: 'not the paperwork',
  body: 'FlexFit Studio brings memberships, class schedules, check-ins and billing into one calm workspace — so your team can stay with the members instead of the spreadsheet.',
  primaryCta: 'Start free trial',
  secondaryCta: 'Book a walkthrough',
}

export const TRUST_STRIP = [
  'Ironworks Collective',
  'Northgate Athletic',
  'Studio Nine',
  'Peak & Pulse',
  'The Rack Room',
  'Vantage Fitness',
]

export const FEATURES: Feature[] = [
  {
    title: 'Membership lifecycle',
    description:
      'Track every enquiry from first walk-in to renewal on one board, with owners and next actions attached.',
    icon: 'Users',
  },
  {
    title: 'Class scheduling',
    description:
      'Build recurring timetables, cap capacity per studio and let waitlists promote themselves automatically.',
    icon: 'CalendarDays',
  },
  {
    title: 'Check-in insight',
    description:
      'See exactly when your floor fills up, so staffing and equipment follow real occupancy instead of guesswork.',
    icon: 'Activity',
  },
  {
    title: 'Billing without chasing',
    description:
      'Recurring plans, failed-payment retries and shared corporate invoices, reconciled in the background.',
    icon: 'CreditCard',
  },
  {
    title: 'Trainer scheduling',
    description:
      'Match coach availability to member programmes and keep one-to-one sessions off the whiteboard.',
    icon: 'Dumbbell',
  },
  {
    title: 'Retention signals',
    description:
      'Surface members whose attendance is slipping while there is still time to bring them back in.',
    icon: 'TrendingUp',
  },
]

/** Three-beat scroll narrative between the hero and the product showcase. */
export const WORKFLOW_STEPS = [
  {
    title: 'They walk through the door',
    body: 'Capture the enquiry at the desk in seconds. Source, goal and owner are recorded before the conversation ends.',
    image: '/images/gym-ropes.jpg',
    alt: 'An athlete training with battle ropes on a covered rooftop',
  },
  {
    title: 'They find their routine',
    body: 'Trials convert into plans, programmes get assigned, and every check-in feeds the picture of how the member is doing.',
    image: '/images/gym-rack.jpg',
    alt: 'A weightlifter pressing a barbell overhead inside a training rack',
  },
  {
    title: 'They stay',
    body: 'Attendance dips, expiring plans and quiet members surface early — so retention becomes a routine, not a rescue.',
    image: '/images/gym-floor.jpg',
    alt: 'A wide gym floor lined with dumbbell racks and training benches',
  },
]

export const RESULTS = [
  { value: '31%', label: 'less admin time per week' },
  { value: '2.4x', label: 'faster trial-to-member conversion' },
  { value: '87%', label: 'average 90-day retention' },
  { value: '11k+', label: 'members managed daily' },
]

export const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      'We replaced three tools and a shared spreadsheet. The lifecycle board alone gave my desk team back an afternoon every week.',
    name: 'Priya Nair',
    role: 'Head Coach, Ironworks Collective',
    avatar: '/images/staff-priya.png',
  },
  {
    quote:
      'The check-in grid changed how we roster. We could finally see the 6pm crush for what it was and staff around it.',
    name: 'Marcus Hale',
    role: 'Operations, Northgate Athletic',
    avatar: '/images/staff-marcus.png',
  },
]

export const PLANS: Plan[] = [
  {
    name: 'Studio',
    price: '₹5,999',
    cadence: '/month',
    description: 'For a single location finding its feet.',
    features: [
      'Up to 300 members',
      'Class scheduling & waitlists',
      'Recurring billing',
      'Email support',
    ],
  },
  {
    name: 'Growth',
    price: '₹11,999',
    cadence: '/month',
    description: 'For busy gyms with a full timetable.',
    features: [
      'Unlimited members',
      'Lifecycle board & retention signals',
      'Trainer scheduling',
      'Corporate & family plans',
      'Priority support',
    ],
    featured: true,
  },
  {
    name: 'Network',
    price: 'Custom',
    cadence: '',
    description: 'For multi-site operators and franchises.',
    features: [
      'Every Growth feature',
      'Cross-site reporting',
      'Access control integrations',
      'Dedicated onboarding',
    ],
  },
]

export const FOOTER_GROUPS = [
  {
    title: 'Product',
    links: ['Features', 'Pricing', 'Integrations', 'Changelog'],
  },
  {
    title: 'Company',
    links: ['About', 'Careers', 'Blog', 'Contact'],
  },
  {
    title: 'Resources',
    links: ['Help centre', 'Onboarding guide', 'API docs', 'Status'],
  },
]
