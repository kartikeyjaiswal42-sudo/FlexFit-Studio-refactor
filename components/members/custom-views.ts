/**
 * Saved views somebody makes themselves, kept on their own device.
 *
 * The five built-in views in member-query.ts answer the questions the studio
 * always has. The reason to save your own is the question only you have — "my
 * Tuesday morning regulars at Northgate", "corporate members who have not been
 * in for three weeks" — and there was no way to keep one: you rebuilt the
 * filters by hand every time.
 *
 * These live in localStorage rather than the database on purpose. A saved view
 * is a personal working set, not studio data; storing it centrally would put
 * one person's shortcuts on everybody else's screen, and it would need an
 * owner, a name and a permission rule before it was worth anything.
 */

import { EMPTY_FILTERS, type MemberFilters, type SavedViewDef, type SortDirection, type SortKey } from './member-query'

export const CUSTOM_VIEWS_STORAGE_KEY = 'flexfit_member_views'

/** Custom views carry the same shape as the built-ins so the rail renders both. */
export type CustomViewDef = SavedViewDef

/** Ids are prefixed so a custom view can never collide with a built-in one. */
export const CUSTOM_VIEW_PREFIX = 'my-'

export function isCustomViewId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith(CUSTOM_VIEW_PREFIX)
}

function read(): CustomViewDef[] {
  try {
    const stored = window.localStorage.getItem(CUSTOM_VIEWS_STORAGE_KEY)
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (v): v is CustomViewDef =>
        typeof v === 'object' &&
        v !== null &&
        typeof (v as CustomViewDef).id === 'string' &&
        typeof (v as CustomViewDef).label === 'string' &&
        typeof (v as CustomViewDef).filters === 'object',
    )
  } catch {
    return []
  }
}

export function readCustomViews(): CustomViewDef[] {
  return read()
}

function write(views: CustomViewDef[]): void {
  try {
    window.localStorage.setItem(CUSTOM_VIEWS_STORAGE_KEY, JSON.stringify(views))
  } catch {
    /* storage blocked — the view still applies for this session, just isn't kept */
  }
}

/**
 * Describe a set of filters in words, for the line under the view chip.
 *
 * A saved view whose description is its own name tells you nothing when you
 * come back to it a week later; what you want to know is what it actually
 * filters on, which is exactly what this spells out.
 */
export function describeFilters(filters: MemberFilters, sortKey: SortKey, sortDir: SortDirection): string {
  const parts: string[] = []
  if (filters.search.trim()) parts.push(`matching “${filters.search.trim()}”`)
  if (filters.statuses.length) parts.push(filters.statuses.join(', '))
  if (filters.riskBands.length) parts.push(`${filters.riskBands.join('/')} risk`)
  if (filters.planIds.length) parts.push(`${filters.planIds.length} plan${filters.planIds.length === 1 ? '' : 's'}`)
  if (filters.locations.length) parts.push(filters.locations.join(', '))
  if (filters.trainerIds.length)
    parts.push(`${filters.trainerIds.length} trainer${filters.trainerIds.length === 1 ? '' : 's'}`)
  if (filters.tags.length) parts.push(filters.tags.join(', '))
  if (filters.inactiveDays !== null) parts.push(`not in for ${filters.inactiveDays}+ days`)
  if (filters.failedPaymentsOnly) parts.push('failed payments')
  if (filters.underUsingOnly) parts.push('under-using their plan')
  if (filters.joinedWithinDays !== null) parts.push(`joined in the last ${filters.joinedWithinDays} days`)

  const what = parts.length ? parts.join(' · ') : 'every member'
  return `${what} — sorted by ${sortKey}, ${sortDir === 'asc' ? 'ascending' : 'descending'}.`
}

/**
 * Store the filters currently on screen under a name.
 *
 * Only the fields that differ from empty are kept, so a view stays a small,
 * readable description of a question rather than a snapshot of every control.
 */
export function saveCustomView(
  label: string,
  filters: MemberFilters,
  sortKey: SortKey,
  sortDir: SortDirection,
): CustomViewDef {
  const trimmed: Partial<MemberFilters> = {}
  for (const key of Object.keys(EMPTY_FILTERS) as (keyof MemberFilters)[]) {
    const value = filters[key]
    const empty = EMPTY_FILTERS[key]
    const same = Array.isArray(value) && Array.isArray(empty) ? value.length === 0 : value === empty
    if (!same) {
      // Widening assignment: each key's value is by construction its own type.
      ;(trimmed as Record<string, unknown>)[key] = value
    }
  }

  const view: CustomViewDef = {
    id: `${CUSTOM_VIEW_PREFIX}${Date.now().toString(36)}`,
    label: label.trim(),
    description: describeFilters(filters, sortKey, sortDir),
    filters: trimmed,
    sort: { key: sortKey, dir: sortDir },
  }

  // Saving under a name that already exists replaces it — otherwise refining a
  // view and saving it again leaves two chips with the same label and no way to
  // tell which is which.
  const others = read().filter((v) => v.label.toLowerCase() !== view.label.toLowerCase())
  write([...others, view])
  return view
}

export function deleteCustomView(id: string): void {
  write(read().filter((v) => v.id !== id))
}
