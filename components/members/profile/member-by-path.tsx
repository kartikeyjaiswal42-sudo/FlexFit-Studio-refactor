'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'
import { UserSearch } from 'lucide-react'
import { PageHeader, PageBody } from '@/components/shell/page-header'
import { RequireScreen } from '@/components/shell/app-shell'
import { EmptyState, TableSkeleton } from '@/components/ui/empty-state'
import { getMember } from '@/lib/data/members'
import { useStudio } from '@/lib/store/studio-store'
import { MemberProfile } from './member-profile'

/**
 * A member profile resolved from the URL rather than from the build.
 *
 * Why this exists: the app is a static export, so `/members/[id]` only produces
 * a file for each member that existed when it was built. Somebody added through
 * "Add member" gets an id no exported page answers to — and the Worker was
 * falling back to the members LIST for those, so signing a new member up sent
 * you straight back to the directory you started from, with the URL still
 * saying you were on their profile. Their invoices, notes and billing tab were
 * unreachable, which is what "the new member has no profile" actually was.
 *
 * The Worker now serves THIS page for any unmatched `/members/<id>` (see
 * worker/index.ts). It reads the id out of the path and looks it up in the
 * hydrated dataset, so a record created a second ago renders the same profile
 * as one that shipped in the seed.
 *
 * It deliberately does not decide "no such member" until the store has loaded:
 * before hydration the client only holds the build-time seed, and answering
 * from that would report every new member as missing.
 */
export function MemberByPath() {
  const pathname = usePathname() ?? ''
  const { connection, version } = useStudio()

  const id = React.useMemo(() => {
    const match = /^\/members\/([^/]+)/.exec(pathname)
    return match ? decodeURIComponent(match[1]) : null
  }, [pathname])

  const member = React.useMemo(
    () => (id ? getMember(id) : undefined),
    // The data module is mutated in place on hydrate, so `version` is what
    // changes when the answer changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, version],
  )

  if (member) return <MemberProfile member={member} />

  // Still loading the dataset — a "not found" here would be a guess.
  if (connection === 'connecting') {
    return (
      <div className="p-4">
        <TableSkeleton rows={8} cols={4} />
      </div>
    )
  }

  return (
    <RequireScreen screen="members">
      <PageHeader
        title="Member not found"
        crumbs={[
          { label: 'FlexFit Studio', href: '/dashboard' },
          { label: 'Members', href: '/members' },
          { label: id ?? 'Unknown' },
        ]}
        sticky={false}
      />
      <PageBody>
        <EmptyState
          icon={UserSearch}
          title={id ? `No member with the id ${id}` : 'No member id in the address'}
          description={
            connection === 'offline'
              ? 'The app could not reach the server, so it can only see the members it was built with. Reload once the connection is back.'
              : 'They may have been removed, or the link may be mistyped. The directory has everyone currently on the books.'
          }
          action={{ label: 'Back to the directory', href: '/members' }}
        />
      </PageBody>
    </RequireScreen>
  )
}
