'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, Users } from 'lucide-react'
import { PageHeader } from '@/components/shell/page-header'
import { RequireScreen } from '@/components/shell/app-shell'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { members as allMembers } from '@/lib/data/members'
import { num } from '@/lib/format'
import { MembersFilterBar } from './members-filter-bar'
import { MembersSavedViews } from './members-saved-views'
import { MembersTable } from './members-table'
import { MembersCardList } from './members-card-list'
import { MembersBulkBar } from './members-bulk-bar'
import { AddMemberDialog } from './add-member-dialog'
import { useDataVersion } from '@/lib/store/studio-store'
import { chipStatusFor } from './member-view'
import {
  EMPTY_FILTERS,
  SAVED_VIEW_DEFS,
  applyFilters,
  applySort,
  savedViewById,
  type MemberFilters,
  type SavedViewDef,
  type SortDirection,
  type SortKey,
} from './member-query'
import {
  deleteCustomView,
  readCustomViews,
  saveCustomView,
  type CustomViewDef,
} from './custom-views'

/**
 * Member directory. 380 rows, filterable, sortable, bulk-selectable.
 * The URL carries the active saved view so a link to "at risk · high value" is
 * shareable — the sidebar's saved-view links land here.
 */
export function MembersDirectory() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const viewParam = searchParams.get('view')
  // `?q=` lets another screen hand this one a search — the lead panel uses it to
  // look for the member a won lead became.
  const queryParam = searchParams.get('q')

  const [filters, setFilters] = React.useState<MemberFilters>(EMPTY_FILTERS)
  const [sortKey, setSortKey] = React.useState<SortKey>('risk')
  const [sortDir, setSortDir] = React.useState<SortDirection>('desc')
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [activeView, setActiveView] = React.useState<string | null>(viewParam)
  const [addOpen, setAddOpen] = React.useState(false)
  /**
   * Views this person saved themselves. Read after mount rather than in the
   * initial state: the page is prerendered with none, and a first client render
   * that disagreed with the HTML is a hydration mismatch.
   */
  const [customViews, setCustomViews] = React.useState<CustomViewDef[]>([])
  React.useEffect(() => setCustomViews(readCustomViews()), [])
  // `allMembers` is a live binding that `hydrate()` reassigns. Reading the
  // version here puts this component in the render path of every write, so a
  // member added or frozen elsewhere shows up in the list without a reload.
  const version = useDataVersion()

  // A saved view arriving via the URL (sidebar link) applies its preset once.
  const appliedQueryRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!queryParam || appliedQueryRef.current === queryParam) return
    appliedQueryRef.current = queryParam
    setFilters((prev) => ({ ...prev, search: queryParam }))
  }, [queryParam])

  /** Resolve a view id against the built-ins and this person's own saved ones. */
  const resolveView = React.useCallback(
    (id: string | null | undefined): SavedViewDef | undefined =>
      savedViewById(id) ?? customViews.find((v) => v.id === id),
    [customViews],
  )

  const appliedRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (appliedRef.current === viewParam) return
    appliedRef.current = viewParam
    const view = resolveView(viewParam)
    if (view) {
      setFilters({ ...EMPTY_FILTERS, ...view.filters })
      setSortKey(view.sort.key)
      setSortDir(view.sort.dir)
      setActiveView(view.id)
    } else if (viewParam === null) {
      setActiveView(null)
    }
  }, [viewParam, resolveView])

  const filtered = React.useMemo(() => applyFilters(allMembers, filters), [filters, version])
  const rows = React.useMemo(() => applySort(filtered, sortKey, sortDir), [filtered, sortKey, sortDir])

  // Counts shown inside the filter menus, computed on the unfiltered set so the
  // operator can see how big a bucket is before committing to it.
  const counts = React.useMemo(() => {
    const status: Record<string, number> = {}
    const risk: Record<string, number> = {}
    for (const m of allMembers) {
      const s = chipStatusFor(m)
      status[s] = (status[s] ?? 0) + 1
      risk[m.risk.band] = (risk[m.risk.band] ?? 0) + 1
    }
    return { status, risk }
  }, [version])

  const viewCounts = React.useMemo(() => {
    const out: Record<string, number> = {}
    for (const view of [...SAVED_VIEW_DEFS, ...customViews]) {
      out[view.id] = applyFilters(allMembers, { ...EMPTY_FILTERS, ...view.filters }).length
    }
    return out
  }, [version, customViews])

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      // Text sorts read better ascending; magnitudes read better descending.
      setSortDir(key === 'name' ? 'asc' : 'desc')
    }
  }

  const selectView = (view: SavedViewDef) => {
    setFilters({ ...EMPTY_FILTERS, ...view.filters })
    setSortKey(view.sort.key)
    setSortDir(view.sort.dir)
    setActiveView(view.id)
    setSelected(new Set())
    appliedRef.current = view.id
    router.replace(`/members?view=${view.id}`, { scroll: false })
  }

  const clearView = () => {
    setFilters(EMPTY_FILTERS)
    setActiveView(null)
    setSelected(new Set())
    appliedRef.current = null
    router.replace('/members', { scroll: false })
  }

  // Editing filters by hand detaches from the saved view — the view chip stops
  // claiming to describe a list it no longer matches.
  const changeFilters = (next: MemberFilters) => {
    setFilters(next)
    if (activeView) {
      const view = resolveView(activeView)
      const preset = { ...EMPTY_FILTERS, ...view?.filters }
      if (JSON.stringify(preset) !== JSON.stringify(next)) {
        setActiveView(null)
        appliedRef.current = null
        router.replace('/members', { scroll: false })
      }
    }
  }

  /** Keep the filters and sort on screen as a view of this person's own. */
  const saveCurrentView = (label: string) => {
    const view = saveCustomView(label, filters, sortKey, sortDir)
    setCustomViews(readCustomViews())
    setActiveView(view.id)
    appliedRef.current = view.id
    router.replace(`/members?view=${view.id}`, { scroll: false })
  }

  const removeCustomView = (id: string) => {
    deleteCustomView(id)
    setCustomViews(readCustomViews())
    // Deleting the view you are looking at would otherwise leave the rail
    // highlighting a chip that no longer exists.
    if (activeView === id) clearView()
  }

  /** Nothing to save while the list is exactly the unfiltered default. */
  const filtersTouched =
    JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS) ||
    sortKey !== 'risk' ||
    sortDir !== 'desc'

  const selectedMembers = React.useMemo(
    () => allMembers.filter((m) => selected.has(m.id)),
    [selected, version],
  )

  const activeViewDef = resolveView(activeView)
  const highRisk = filtered.filter((m) => m.risk.band === 'high').length
  const pastDue = filtered.filter((m) => m.metrics.failedPayments > 0).length

  return (
    <RequireScreen screen="members">
      <PageHeader
        title="Members"
        crumbs={[{ label: 'FlexFit Studio', href: '/dashboard' }, { label: 'Members' }]}
        meta={
          <>
            <span className="tnum">{num(filtered.length)} shown</span>
            <span aria-hidden>·</span>
            <span className="tnum">{num(allMembers.length)} total</span>
            <span aria-hidden>·</span>
            <span className="tnum">{num(highRisk)} high risk</span>
            <span aria-hidden>·</span>
            <span className="tnum">{num(pastDue)} with failed payments</span>
          </>
        }
        actions={
          <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="size-3.5" />
            Add member
          </Button>
        }
        sticky={false}
      />

      <MembersSavedViews
        activeId={activeView}
        counts={viewCounts}
        customViews={customViews}
        canSave={filtersTouched}
        onSelect={selectView}
        onClear={clearView}
        onSave={saveCurrentView}
        onDelete={removeCustomView}
      />

      {activeViewDef ? (
        <p className="border-b border-border bg-surface px-4 py-1.5 text-micro leading-relaxed text-muted-foreground">
          {activeViewDef.description}
        </p>
      ) : null}

      <MembersFilterBar
        filters={filters}
        onChange={changeFilters}
        resultCount={filtered.length}
        totalCount={allMembers.length}
        counts={counts}
      />

      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={Users}
            title="No members match these filters"
            description={
              filters.search
                ? `Nothing matches "${filters.search}". Check for a typo, or clear the filters to search all ${num(allMembers.length)} members.`
                : `All ${num(allMembers.length)} members were excluded. Remove a filter to widen the list.`
            }
            action={{ label: 'Clear all filters', onClick: clearView }}
          />
        </div>
      ) : (
        <>
          <MembersTable
            members={rows}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
            selected={selected}
            onSelectedChange={setSelected}
          />
          <MembersCardList
            members={rows}
            selected={selected}
            onSelectedChange={setSelected}
          />
          <div className="flex items-center justify-between px-4 py-2 text-micro text-muted-foreground">
            <span className="tnum">
              Showing {num(rows.length)} of {num(allMembers.length)} members
            </span>
            <span className="hidden sm:inline">
              Sorted by {sortKey} · {sortDir === 'asc' ? 'ascending' : 'descending'}
            </span>
          </div>
        </>
      )}

      <MembersBulkBar selectedMembers={selectedMembers} onClear={() => setSelected(new Set())} />
      <AddMemberDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </RequireScreen>
  )
}
