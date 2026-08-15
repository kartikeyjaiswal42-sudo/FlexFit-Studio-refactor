'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, Check, ChevronDown, LogOut, Menu, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useApp, LOCATIONS } from '@/components/shell/role-context'
import { forgetRole } from '@/lib/role-preference'

/** Lightweight popover: click-outside + Esc. No dependency needed. */
function Popover({
  trigger,
  children,
  align = 'start',
  width = 'w-64',
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode
  children: (close: () => void) => React.ReactNode
  align?: 'start' | 'end'
  width?: string
}) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open ? (
        <div
          className={cn(
            'absolute top-[calc(100%+4px)] z-40 overflow-hidden rounded-md border border-border-strong bg-popover',
            'shadow-[0_8px_28px_-8px_oklch(0.2_0.01_258/0.22)] animate-in fade-in duration-150',
            align === 'end' ? 'right-0' : 'left-0',
            width,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  )
}

function MenuRow({
  primary,
  secondary,
  selected,
  onClick,
  trailing,
}: {
  primary: string
  secondary?: string
  selected?: boolean
  onClick?: () => void
  trailing?: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors duration-150',
        selected ? 'bg-primary-soft' : 'hover:bg-muted',
      )}
    >
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-sm font-medium text-foreground">{primary}</span>
        {secondary ? (
          <span className="block truncate text-micro text-muted-foreground">{secondary}</span>
        ) : null}
      </span>
      {trailing}
      {selected ? <Check className="size-3.5 shrink-0 text-primary" /> : null}
    </button>
  )
}

export function TopBar({
  onOpenSidebar,
  className,
}: {
  onOpenSidebar?: () => void
  className?: string
}) {
  const { roleMeta, location, setLocation, unread, setCommandOpen } = useApp()
  const router = useRouter()
  const searchRef = React.useRef<HTMLInputElement>(null)

  // "/" focuses search, Cmd+K opens the palette (Batch 9 renders it).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable
      if (e.key === '/' && !typing) {
        e.preventDefault()
        searchRef.current?.focus()
      }
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setCommandOpen(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [setCommandOpen])

  return (
    <header
      className={cn(
        'flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface px-3',
        className,
      )}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Open navigation"
        className="lg:hidden"
        onClick={onOpenSidebar}
      >
        <Menu className="size-4" />
      </Button>

      {/* location switcher */}
      <Popover
        trigger={({ open, toggle }) => (
          <button
            type="button"
            aria-expanded={open}
            onClick={toggle}
            className="hidden h-7 items-center gap-1.5 rounded-md border border-border bg-surface px-2 text-sm transition-colors hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring sm:flex"
          >
            <span className="font-medium text-foreground">{location.name}</span>
            <ChevronDown className="size-3 text-muted-foreground" />
          </button>
        )}
      >
        {(close) => (
          <div className="py-1">
            {LOCATIONS.map((l) => (
              <MenuRow
                key={l.id}
                primary={l.name}
                secondary={l.city}
                selected={l.id === location.id}
                trailing={
                  <span className="text-micro text-muted-foreground tnum">{l.members}</span>
                }
                onClick={() => {
                  setLocation(l.id)
                  close()
                }}
              />
            ))}
          </div>
        )}
      </Popover>

      <div className="relative ml-auto w-full max-w-xs">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <input
          ref={searchRef}
          type="search"
          placeholder="Search members, classes, invoices"
          aria-label="Search"
          className="h-7 w-full rounded-md border border-input bg-surface pl-7 pr-12 text-sm placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <kbd className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm border border-border bg-muted px-1 font-mono text-micro text-muted-foreground">
          /
        </kbd>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="hidden gap-1.5 text-muted-foreground lg:inline-flex"
        onClick={() => setCommandOpen(true)}
      >
        <span>Command</span>
        <kbd className="rounded-sm border border-border bg-muted px-1 font-mono text-micro">⌘K</kbd>
      </Button>

      <Link
        href="/notifications"
        aria-label={`Notifications, ${unread} unread`}
        className="relative flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
      >
        <Bell className="size-4" />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-3.5 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-semibold leading-[14px] text-primary-foreground tnum">
            {unread}
          </span>
        ) : null}
      </Link>

      {/*
        Who you are signed in as — and nothing more.

        This used to be a role SWITCHER, which meant a member could read the
        owner's navigation off a dropdown and step into it. Your own role is
        fine to show; the whole staff hierarchy is not. Changing role now means
        signing out and back in through the door that role belongs to.
      */}
      <Popover
        align="end"
        width="w-60"
        trigger={({ open, toggle }) => (
          <button
            type="button"
            aria-expanded={open}
            aria-label={`Signed in as ${roleMeta.person}, ${roleMeta.label}`}
            onClick={toggle}
            className="flex h-7 shrink-0 items-center gap-1.5 rounded-md pl-0.5 pr-1 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          >
            <span
              aria-hidden
              className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-micro font-semibold text-muted-foreground"
            >
              {roleMeta.person
                .split(' ')
                .map((p) => p[0])
                .join('')}
            </span>
            <span className="hidden text-sm font-medium text-foreground sm:inline">
              {roleMeta.label}
            </span>
            <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
          </button>
        )}
      >
        {() => (
          <div className="py-1">
            <div className="px-2.5 py-1.5 leading-tight">
              <p className="truncate text-sm font-medium text-foreground">{roleMeta.person}</p>
              <p className="truncate text-micro text-muted-foreground">
                {roleMeta.label} · {roleMeta.context}
              </p>
            </div>
            <div className="border-t border-border pt-1">
              <button
                type="button"
                onClick={() => {
                  forgetRole()
                  router.push('/login')
                }}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm text-foreground transition-colors duration-150 hover:bg-muted"
              >
                <LogOut className="size-3.5 text-muted-foreground" />
                Sign out
              </button>
            </div>
          </div>
        )}
      </Popover>
    </header>
  )
}

export { Popover, MenuRow }
