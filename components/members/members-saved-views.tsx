'use client'

import * as React from 'react'
import { Bookmark, BookmarkCheck, BookmarkPlus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { num } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { SAVED_VIEW_DEFS, type SavedViewDef } from './member-query'
import type { CustomViewDef } from './custom-views'

/**
 * Saved views as a horizontal rail above the table. The sidebar links here too;
 * this rail exists so the active view and its live count are visible while you
 * work, and so switching views costs one click rather than a navigation.
 *
 * "Save this view" is the other half of it: the five built-ins answer the
 * studio's standing questions, and this button lets somebody keep their own.
 * Without it, every view that mattered to one person had to be rebuilt from the
 * filter bar each time — which is the same as not having saved views at all.
 */
export function MembersSavedViews({
  activeId,
  counts,
  customViews,
  canSave,
  onSelect,
  onClear,
  onSave,
  onDelete,
}: {
  activeId: string | null
  /** Live result count per view, computed against the full dataset. */
  counts: Record<string, number>
  customViews: CustomViewDef[]
  /** False when the filters are untouched — there would be nothing to save. */
  canSave: boolean
  onSelect: (view: SavedViewDef) => void
  onClear: () => void
  onSave: (label: string) => void
  onDelete: (id: string) => void
}) {
  const [saveOpen, setSaveOpen] = React.useState(false)
  const [label, setLabel] = React.useState('')

  React.useEffect(() => {
    if (saveOpen) setLabel('')
  }, [saveOpen])

  const chip = (active: boolean) =>
    cn(
      'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-sm border px-1.5 text-micro transition-colors duration-150',
      active
        ? 'border-primary bg-primary-soft font-medium text-accent-foreground'
        : 'border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground',
    )

  return (
    <>
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-border bg-subtle px-4 py-1.5 scrollbar-thin">
        <span className="shrink-0 pr-1 text-micro font-medium tracking-wide text-muted-foreground uppercase">
          Views
        </span>

        <button
          type="button"
          aria-pressed={activeId === null}
          onClick={onClear}
          className={chip(activeId === null)}
        >
          All members
        </button>

        {SAVED_VIEW_DEFS.map((view) => {
          const active = view.id === activeId
          const Icon = active ? BookmarkCheck : Bookmark
          return (
            <button
              key={view.id}
              type="button"
              aria-pressed={active}
              title={view.description}
              onClick={() => onSelect(view)}
              className={chip(active)}
            >
              <Icon aria-hidden className={cn('size-3', active ? 'text-primary' : 'opacity-60')} />
              {view.label}
              <span className={cn('tnum', active ? 'text-accent-foreground' : 'opacity-70')}>
                {num(counts[view.id] ?? 0)}
              </span>
            </button>
          )
        })}

        {customViews.length > 0 ? (
          <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-border" />
        ) : null}

        {customViews.map((view) => {
          const active = view.id === activeId
          const Icon = active ? BookmarkCheck : Bookmark
          return (
            /* The chip and its delete control are two buttons, not one button
               containing another — nesting them is invalid HTML and the inner
               one stops being reachable by keyboard. */
            <span key={view.id} className={cn(chip(active), 'gap-1 pr-0.5')}>
              <button
                type="button"
                aria-pressed={active}
                title={view.description}
                onClick={() => onSelect(view)}
                className="inline-flex items-center gap-1.5"
              >
                <Icon aria-hidden className={cn('size-3', active ? 'text-primary' : 'opacity-60')} />
                {view.label}
                <span className={cn('tnum', active ? 'text-accent-foreground' : 'opacity-70')}>
                  {num(counts[view.id] ?? 0)}
                </span>
              </button>
              <button
                type="button"
                aria-label={`Delete the saved view ${view.label}`}
                onClick={() => onDelete(view.id)}
                className="flex size-4 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-danger"
              >
                <X className="size-3" />
              </button>
            </span>
          )
        })}

        <button
          type="button"
          onClick={() => setSaveOpen(true)}
          disabled={!canSave}
          title={
            canSave
              ? 'Keep the filters and sort currently applied as a view of your own'
              : 'Filter or sort the list first — there is nothing to save yet'
          }
          className={cn(
            chip(false),
            'ml-auto border-dashed',
            !canSave && 'cursor-not-allowed opacity-50 hover:border-border hover:text-muted-foreground',
          )}
        >
          <BookmarkPlus aria-hidden className="size-3" />
          Save this view
        </button>
      </div>

      <Modal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title="Save this view"
        description="Keeps the filters and sort you have applied, on this device, under a name you choose."
        footer={
          <>
            <Button variant="secondary" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={label.trim().length === 0}
              onClick={() => {
                onSave(label)
                setSaveOpen(false)
              }}
            >
              Save view
            </Button>
          </>
        }
      >
        <Field
          label="Name"
          htmlFor="view-name"
          help="Saving over a name you already used replaces that view rather than adding a second one."
        >
          <Input
            id="view-name"
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.currentTarget.value)}
            placeholder="e.g. Northgate corporate, quiet 3 weeks"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && label.trim().length > 0) {
                onSave(label)
                setSaveOpen(false)
              }
            }}
          />
        </Field>
      </Modal>
    </>
  )
}
