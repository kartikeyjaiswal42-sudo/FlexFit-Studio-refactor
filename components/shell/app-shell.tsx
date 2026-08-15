'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { X, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Sidebar, NAV } from '@/components/shell/sidebar'
import { TopBar } from '@/components/shell/top-bar'
import { useApp, type ScreenKey } from '@/components/shell/role-context'

/**
 * The consistent shell used by every screen except the kiosk.
 * Desktop: sidebar + top bar. Mobile: top bar + bottom tab bar, sidebar as a drawer.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const pathname = usePathname()

  React.useEffect(() => setDrawerOpen(false), [pathname])

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <Sidebar className="hidden lg:flex" />

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-foreground/30 animate-in fade-in duration-150"
          />
          <div className="relative animate-in duration-150 ease-[var(--ease-ui)] slide-in-from-left-4">
            <Sidebar />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close navigation"
              className="absolute right-2 top-2.5"
              onClick={() => setDrawerOpen(false)}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenSidebar={() => setDrawerOpen(true)} />
        <main className="flex-1 overflow-y-auto scrollbar-thin">{children}</main>
        <BottomTabBar />
      </div>
    </div>
  )
}

/** Mobile navigation. Trainer and Member roles live here primarily. */
function BottomTabBar() {
  const { can } = useApp()
  const pathname = usePathname() ?? ''
  const items = NAV.filter((item) => can(item.screen)).slice(0, 5)

  return (
    <nav
      aria-label="Primary mobile"
      className="flex shrink-0 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {items.map((item) => {
        const Icon = item.icon
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
        return (
          <Link
            key={item.screen}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex flex-1 flex-col items-center gap-0.5 py-2 text-micro transition-colors duration-150',
              active ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <Icon className="size-[18px]" />
            <span className="truncate px-1">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

/**
 * Permission guard. Wrap any page body with this — a Trainer hitting /billing
 * gets the designed no-access screen rather than a redirect.
 */
export function RequireScreen({
  screen,
  children,
}: {
  screen: ScreenKey
  children: React.ReactNode
}) {
  const { can, roleMeta, roleResolved } = useApp()
  if (can(screen)) return <>{children}</>

  // The signed-in role is read back from storage on mount, so for the first
  // frame every session looks like the default owner. Showing the no-access
  // panel then would flash it at exactly the people who DO have access — a
  // trainer arriving on /my-schedule straight from sign-in. Wait one frame.
  if (!roleResolved) return null

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md rounded-md border border-border bg-card p-6">
        <span className="flex size-8 items-center justify-center rounded-sm border border-border bg-muted">
          <Lock className="size-4 text-muted-foreground" />
        </span>
        <h1 className="mt-3 text-lg font-semibold text-foreground">
          This screen isn&apos;t part of your role
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          You&apos;re signed in as <span className="font-medium text-foreground">{roleMeta.label}</span> (
          {roleMeta.person}). Billing and revenue screens are limited to Owner and Manager roles. Ask
          Dana Okonkwo if you need access.
        </p>
        <div className="mt-4 flex gap-2">
          <Link
            href={roleMeta.landing}
            className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          >
            Back to {roleMeta.label === 'Trainer' ? 'my schedule' : 'my home screen'}
          </Link>
        </div>
      </div>
    </div>
  )
}

export { BottomTabBar }
