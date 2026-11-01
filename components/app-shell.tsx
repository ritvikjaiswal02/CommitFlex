import * as React from 'react'
import { getUserPlan } from '@/lib/plans'
import { getQueueStats } from '@/lib/db/queries/autopilot'
import type { PlanId, PlanStatus } from '@/lib/billing/catalog'
import { cn } from '@/lib/utils'
import { UpgradeProvider } from '@/components/billing/upgrade-provider'
import { AppMobileNav, AppSidebar, type SidebarCounts } from '@/components/app-sidebar'

const WIDTH = {
  default: 'max-w-[1120px]',
  wide: 'max-w-[1360px]',
  narrow: 'max-w-[760px]',
} as const

const DAY_MS = 24 * 60 * 60 * 1000

export interface AppShellProps {
  user: { id: string; name?: string | null; email?: string | null; image?: string | null }
  children: React.ReactNode
  width?: keyof typeof WIDTH
}

async function loadPlan(userId: string): Promise<{ id: PlanId; status: PlanStatus; trialDaysLeft: number | null }> {
  try {
    const plan = await getUserPlan(userId)
    const trialDaysLeft =
      plan.status === 'trialing' && plan.trialEndsAt
        ? Math.max(0, Math.ceil((new Date(plan.trialEndsAt).getTime() - Date.now()) / DAY_MS))
        : null
    return { id: plan.id, status: plan.status, trialDaysLeft }
  } catch (err) {
    console.error('[app-shell] getUserPlan failed', err)
    return { id: 'free', status: 'free', trialDaysLeft: null }
  }
}

async function loadCounts(userId: string): Promise<SidebarCounts> {
  try {
    const stats = await getQueueStats(userId)
    return { review: stats.pendingReview ?? 0, ready: stats.ready ?? 0 }
  } catch (err) {
    console.error('[app-shell] getQueueStats failed', err)
    return { review: 0, ready: 0 }
  }
}

/**
 * The signed-in app frame: fixed sidebar on desktop, a top bar with a sheet
 * below `lg`, and the page container. Every app page renders inside it:
 *
 *   <AppShell user={session.user}>…</AppShell>
 */
export async function AppShell({ user, children, width = 'default' }: AppShellProps) {
  const [plan, counts] = await Promise.all([loadPlan(user.id), loadCounts(user.id)])
  const sidebarUser = {
    id: user.id,
    name: user.name ?? null,
    email: user.email ?? null,
    image: user.image ?? null,
  }

  return (
    <UpgradeProvider>
      <div className="min-h-dvh bg-canvas">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-toast focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-fg focus:shadow-md focus-ring"
        >
          Skip to content
        </a>

        <aside
          aria-label="Sidebar"
          className="fixed inset-y-0 left-0 z-sidebar hidden w-[var(--sidebar-width)] lg:block"
        >
          <AppSidebar user={sidebarUser} plan={plan} counts={counts} variant="desktop" />
        </aside>

        <AppMobileNav user={sidebarUser} plan={plan} counts={counts} />

        <main id="main" tabIndex={-1} className="outline-none lg:pl-[var(--sidebar-width)]">
          <div
            className={cn(
              'mx-auto w-full px-4 py-6 sm:px-6 lg:px-10 lg:py-10',
              WIDTH[width],
            )}
          >
            {children}
          </div>
        </main>
      </div>
    </UpgradeProvider>
  )
}
