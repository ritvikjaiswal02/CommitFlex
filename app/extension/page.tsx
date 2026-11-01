import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { appUrl, optionalEnv } from '@/lib/env'
import { getUserPlan, limitFor } from '@/lib/plans'
import { listApiTokens, type ApiTokenSummary } from '@/lib/db/queries/tokens'
import { AppShell } from '@/components/app-shell'
import { PageHeader } from '@/components/ui/page-header'
import { ErrorState } from '@/components/ui/error-state'
import { ExtensionManager } from './_components/extension-manager'
import { Capabilities, InstallGuide } from './_components/install-guide'

export const metadata: Metadata = {
  title: 'Chrome extension',
  description: 'Insert CommitFlex drafts into LinkedIn and X, and draft posts from GitHub.',
}

export const dynamic = 'force-dynamic'

async function loadTokens(userId: string): Promise<{ tokens: ApiTokenSummary[]; max: number } | null> {
  try {
    const [tokens, plan] = await Promise.all([listApiTokens(userId), getUserPlan(userId)])
    return { tokens, max: limitFor(plan.id, 'extensionTokens') }
  } catch (err) {
    console.error('[extension page] failed to load tokens', err)
    return null
  }
}

export default async function ExtensionPage() {
  const session = await auth()
  const user = session?.user
  if (!user?.id) redirect('/login?next=/extension')

  const data = await loadTokens(user.id)
  const storeUrl = optionalEnv('NEXT_PUBLIC_CHROME_EXTENSION_URL') ?? null

  return (
    <AppShell user={{ id: user.id, name: user.name, email: user.email, image: user.image }}>
      <PageHeader
        title="Chrome extension"
        description="Post your drafts from inside LinkedIn and X, and start drafts from GitHub pull requests and releases."
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-10">
        <div className="flex min-w-0 flex-col gap-8">
          {data ? (
            <ExtensionManager
              initialTokens={data.tokens}
              limit={{ used: data.tokens.length, max: data.max }}
              appUrl={appUrl()}
              storeUrl={storeUrl}
              user={{ email: user.email ?? null, name: user.name ?? null }}
            />
          ) : (
            <div className="rounded-lg border border-line bg-surface">
              <ErrorState
                title="Your extension tokens didn't load"
                description="CommitFlex couldn't reach its database. Reload the page in a moment."
              />
            </div>
          )}
          <Capabilities />
        </div>

        <aside className="flex min-w-0 flex-col gap-8">
          <InstallGuide storeUrl={storeUrl} />
        </aside>
      </div>
    </AppShell>
  )
}
