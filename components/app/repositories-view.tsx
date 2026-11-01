'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useUpgrade } from '@/components/billing/upgrade-provider'
import type { PlanId } from '@/lib/billing/catalog'
import { RepoConnect } from '@/components/repo-connect'
import { RepoManager, type ManagedRepo } from '@/components/repo-manager'

export interface RepositoriesViewProps {
  repos: (ManagedRepo & { githubRepoId: string })[]
  limit: { used: number; max: number }
  timezone: string
  /** Set when the page was opened with ?connect=1. */
  openConnect?: boolean
  planId?: PlanId
}

/** Connect button + sheet in the page header slot. */
export function ConnectReposButton({ atLimit, max, onOpen }: { atLimit: boolean; max: number; onOpen: () => void }) {
  const { openUpgrade } = useUpgrade()
  if (atLimit) {
    return (
      <Button
        onClick={() =>
          openUpgrade({ code: 'limit_reached', limit: 'repos', used: max, max }, max >= 10 ? 'team' : 'pro')
        }
      >
        <Plus strokeWidth={1.75} aria-hidden="true" />
        Add repositories
      </Button>
    )
  }
  return (
    <Button onClick={onOpen}>
      <Plus strokeWidth={1.75} aria-hidden="true" />
      Add repositories
    </Button>
  )
}

/** The repositories page body: the managed list and the connect sheet. */
export function RepositoriesView({ repos, limit, timezone, openConnect = false, planId = 'free' }: RepositoriesViewProps) {
  const router = useRouter()
  const [open, setOpen] = React.useState(openConnect)
  const connectedIds = React.useMemo(() => repos.map((r) => r.githubRepoId), [repos])
  const atLimit = limit.used >= limit.max

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">
          <span className="tabular-nums text-fg">{limit.used}</span> of{' '}
          <span className="tabular-nums">{limit.max}</span> repositories on your plan.
        </p>
        <ConnectReposButton atLimit={atLimit} max={limit.max} onOpen={() => setOpen(true)} />
      </div>

      <RepoManager
        repos={repos}
        planId={planId}
        emptyAction={
          <Button onClick={() => setOpen(true)}>
            <Plus strokeWidth={1.75} aria-hidden="true" />
            Connect a repository
          </Button>
        }
      />

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" size="md">
          <SheetHeader>
            <SheetTitle>Add repositories</SheetTitle>
            <SheetDescription>
              CommitFlex reads commit messages, pull request titles and release notes. It never reads or stores your
              source code.
            </SheetDescription>
          </SheetHeader>
          <SheetBody>
            <RepoConnect
              connectedGithubIds={connectedIds}
              timezone={timezone}
              onConnected={() => router.refresh()}
            />
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  )
}
