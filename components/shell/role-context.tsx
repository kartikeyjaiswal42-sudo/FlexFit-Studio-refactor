'use client'

import * as React from 'react'
import { readRememberedRole, rememberRole } from '@/lib/role-preference'

/**
 * Role + location state for the whole app. The role reshapes navigation,
 * permitted screens and the landing page; later batches read `can()` to render
 * the no-access screen instead of the content.
 */

export type Role = 'owner' | 'front_desk' | 'trainer' | 'member'

export interface RoleMeta {
  id: Role
  label: string
  person: string
  context: string
  landing: string
}

export const ROLES: RoleMeta[] = [
  {
    id: 'owner',
    label: 'Owner',
    person: 'Dana Okonkwo',
    context: 'Desktop · all locations',
    landing: '/dashboard',
  },
  {
    id: 'front_desk',
    label: 'Front desk',
    person: 'Marco Silveira',
    context: 'Laptop + kiosk',
    landing: '/check-in',
  },
  {
    id: 'trainer',
    label: 'Trainer',
    person: 'Priya Raghunathan',
    context: 'Phone · between sessions',
    landing: '/my-schedule',
  },
  {
    id: 'member',
    label: 'Member',
    person: 'Tomas Lindqvist',
    context: 'Phone · self-serve',
    landing: '/portal',
  },
]

export interface LocationMeta {
  id: string
  name: string
  city: string
  members: number
}

export const LOCATIONS: LocationMeta[] = [
  { id: 'all', name: 'All locations', city: '3 sites', members: 380 },
  { id: 'riverside', name: 'Riverside', city: 'Flagship · 12,000 sqft', members: 198 },
  { id: 'northgate', name: 'Northgate', city: 'Studio · 4,200 sqft', members: 121 },
  { id: 'harbour', name: 'Harbour Point', city: 'Studio · 3,100 sqft', members: 61 },
]

/** Screen keys used by both the sidebar and the no-access guard. */
export type ScreenKey =
  | 'dashboard'
  | 'members'
  | 'retention'
  | 'schedule'
  | 'my_schedule'
  | 'check_in'
  | 'kiosk'
  | 'billing'
  | 'payments'
  | 'corporate'
  | 'leads'
  | 'trainers'
  | 'equipment'
  | 'reports'
  | 'notifications'
  | 'portal'
  | 'settings'

const PERMISSIONS: Record<Role, ScreenKey[]> = {
  owner: [
    'dashboard',
    'members',
    'retention',
    'schedule',
    'check_in',
    'kiosk',
    'billing',
    'payments',
    'corporate',
    'leads',
    'trainers',
    'equipment',
    'reports',
    'notifications',
    'settings',
  ],
  front_desk: [
    'check_in',
    'kiosk',
    'members',
    'schedule',
    'leads',
    'payments',
    'equipment',
    'notifications',
  ],
  // Equipment is on all three of the non-owner roles for different reasons: the
  // trainer reports the fault, the member checks what is working before coming
  // in and books the sauna, and the front desk fields "is the court free?".
  trainer: ['my_schedule', 'members', 'check_in', 'equipment', 'notifications'],
  member: ['portal', 'equipment', 'notifications'],
}

interface AppState {
  role: Role
  roleMeta: RoleMeta
  setRole: (role: Role) => void
  /**
   * False for the first frame after mount, while the signed-in role is read
   * back from storage. `RequireScreen` waits on this: without it, a trainer
   * landing on /my-schedule renders one frame as the default owner — who has
   * no such permission — and flashes the "not part of your role" panel before
   * correcting itself.
   */
  roleResolved: boolean
  location: LocationMeta
  setLocation: (id: string) => void
  can: (screen: ScreenKey) => boolean
  unread: number
  commandOpen: boolean
  setCommandOpen: (open: boolean) => void
}

const AppContext = React.createContext<AppState | null>(null)

export function useApp() {
  const ctx = React.useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>')
  return ctx
}

export function AppProvider({
  children,
  initialRole = 'owner',
}: {
  children: React.ReactNode
  initialRole?: Role
}) {
  const [role, setRoleState] = React.useState<Role>(initialRole)
  const [roleResolved, setRoleResolved] = React.useState(false)
  const [locationId, setLocationId] = React.useState('all')
  const [commandOpen, setCommandOpen] = React.useState(false)

  /**
   * Adopt whichever role signed in.
   *
   * `useLayoutEffect` rather than `useEffect` so this runs before the browser
   * paints — the role is settled in the same frame the shell first appears,
   * instead of the screen showing the default role and then swapping.
   *
   * Reading storage in a `useState` initializer would be simpler and is wrong
   * here: this app is a static export, so the prerendered HTML is built with
   * the default role, and a client-side initial render that disagreed with it
   * is a hydration mismatch.
   */
  React.useLayoutEffect(() => {
    const remembered = readRememberedRole()
    if (remembered) setRoleState(remembered)
    setRoleResolved(true)
  }, [])

  /** Switching role in the app persists too, so a reload stays where you were. */
  const setRole = React.useCallback((next: Role) => {
    setRoleState(next)
    rememberRole(next)
  }, [])

  const value = React.useMemo<AppState>(() => {
    const roleMeta = ROLES.find((r) => r.id === role) ?? ROLES[0]
    const location = LOCATIONS.find((l) => l.id === locationId) ?? LOCATIONS[0]
    return {
      role,
      roleMeta,
      setRole,
      roleResolved,
      location,
      setLocation: setLocationId,
      can: (screen) => PERMISSIONS[role].includes(screen),
      unread: role === 'member' ? 2 : role === 'owner' ? 7 : 4,
      commandOpen,
      setCommandOpen,
    }
  }, [role, roleResolved, setRole, locationId, commandOpen])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export { PERMISSIONS }
