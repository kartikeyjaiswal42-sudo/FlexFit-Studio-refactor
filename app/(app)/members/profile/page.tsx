import type { Metadata } from 'next'
import { MemberByPath } from '@/components/members/profile/member-by-path'

export const metadata: Metadata = {
  title: 'Member — FlexFit Studio',
  description: 'Member profile resolved from the address.',
}

/**
 * The fallback shell for `/members/<id>`.
 *
 * `generateStaticParams` in the sibling `[id]` route exports one page per
 * member that existed at build time, which is what makes this app static. A
 * member added afterwards has no such page, so the Worker serves THIS one and
 * the component reads the id back out of the URL (see worker/index.ts and
 * components/members/profile/member-by-path.tsx).
 *
 * `/members/profile` is not a member id — ids are `m-…` — so this route and the
 * dynamic one cannot collide.
 */
export default function MemberProfileShellPage() {
  return <MemberByPath />
}
