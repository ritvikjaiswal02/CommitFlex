import type { ReactNode } from 'react'
import { UpgradeProvider } from '@/components/billing/upgrade-provider'
import type { PlanId } from '@/lib/billing/catalog'
import { SiteFooter } from '@/components/landing/site-footer'
import { SiteHeader } from '@/components/landing/site-header'

/** Header, main landmark and footer shared by the landing, pricing and legal pages. */
export function MarketingShell({
  signedIn = false,
  currentPlan,
  children,
}: {
  signedIn?: boolean
  currentPlan?: PlanId
  children: ReactNode
}) {
  return (
    <UpgradeProvider currentPlan={currentPlan}>
      <div className="flex min-h-screen flex-col bg-canvas">
        <SiteHeader signedIn={signedIn} />
        <main id="main" tabIndex={-1} className="flex-1 outline-none">
          {children}
        </main>
        <SiteFooter signedIn={signedIn} />
      </div>
    </UpgradeProvider>
  )
}
