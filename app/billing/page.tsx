import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { isBillingInterval, isPaidPlanId } from '@/lib/billing/catalog'
import { listSubscriptions } from '@/lib/db/queries/billing'
import { optionalEnv } from '@/lib/env'
import { buildBillingStatus } from '@/app/api/billing/_lib/status'
import { BillingView } from '@/components/billing/billing-view'
import { UpgradeProvider } from '@/components/billing/upgrade-provider'
import { ErrorState } from '@/components/ui/error-state'
import { PageHeader } from '@/components/ui/page-header'

export const dynamic = 'force-dynamic'

interface BillingPageProps {
  searchParams?: { plan?: string | string[]; interval?: string | string[] }
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login?next=/billing')
  const userId = session.user.id

  const planParam = first(searchParams?.plan)
  const intervalParam = first(searchParams?.interval)
  const highlight = isPaidPlanId(planParam) ? planParam : null
  const defaultInterval = isBillingInterval(intervalParam) ? intervalParam : undefined

  let status: Awaited<ReturnType<typeof buildBillingStatus>>
  let hasPaidHistory = false
  try {
    const [built, subs] = await Promise.all([buildBillingStatus(userId, headers()), listSubscriptions(userId)])
    status = built
    hasPaidHistory = subs.some((s) => s.status !== 'created')
  } catch (err) {
    console.error('[billing] page failed to load', err)
    return (
      <>
        <PageHeader title="Billing" description="Your plan, what you've used this month, and your invoices." />
        <ErrorState
          title="Billing didn't load"
          description="We couldn't reach the database to read your plan. Reload the page in a moment; nothing about your subscription has changed."
        />
      </>
    )
  }

  return (
    <UpgradeProvider currentPlan={status.plan.id}>
      <BillingView
        status={status}
        hasPaidHistory={hasPaidHistory}
        supportEmail={optionalEnv('SUPPORT_EMAIL') ?? null}
        highlight={highlight}
        defaultInterval={defaultInterval}
      />
    </UpgradeProvider>
  )
}
