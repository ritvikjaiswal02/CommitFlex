import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { eq, and } from 'drizzle-orm'
import Link from 'next/link'
import { db } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'
import { getVoiceSettings } from '@/lib/db/queries/voice'
import { getUserRepos } from '@/lib/db/queries/repos'
import { VoiceSettingsForm } from '@/components/voice-settings-form'
import { RepoManager } from '@/components/repo-manager'
import { AppShell } from '@/components/app-sidebar'
import {
  AccountCard,
  NotificationsCard,
  DangerZoneCard,
} from '@/components/settings-account'

function SectionHeader({ label, hint }: { label: string; hint?: string }) {
  return (
    <div>
      <h2 className="font-mono text-label-caps uppercase tracking-widest text-primary">{label}</h2>
      {hint && <p className="text-on-surface-variant mt-1">{hint}</p>}
    </div>
  )
}

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const userId = session.user.id

  const [voice, repos, githubAccount] = await Promise.all([
    getVoiceSettings(userId),
    getUserRepos(userId),
    db.select({ providerAccountId: accounts.providerAccountId, scope: accounts.scope })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.provider, 'github')))
      .limit(1),
  ])

  return (
    <AppShell user={{ name: session.user.name, email: session.user.email, image: session.user.image }}>
      <header className="mb-xl">
        <h1 className="font-display text-headline-md font-bold text-on-surface">Settings</h1>
        <p className="text-on-surface-variant mt-1">
          Account, voice, notifications, and dangerous things.
        </p>
      </header>

      <div className="max-w-3xl space-y-xl">
        {/* Account */}
        <section className="space-y-md">
          <SectionHeader label="Account" hint="Profile, connected accounts, and sign-out." />
          <AccountCard
            info={{
              name: session.user.name,
              email: session.user.email,
              image: session.user.image,
              githubUsername: githubAccount[0]?.providerAccountId ?? null,
            }}
          />
        </section>

        {/* Voice profile */}
        <section className="space-y-md">
          <SectionHeader label="Voice profile" hint="How you write — the AI uses this to match your tone." />
          <div className="glass-card rounded-xl overflow-hidden p-lg">
            <VoiceSettingsForm
              initialTone={voice?.tone ?? 'professional'}
              initialTechnicalLevel={voice?.technicalLevel ?? 7}
              initialAudience={voice?.audience ?? 'developers'}
              initialExtraContext={voice?.extraContext ?? ''}
            />
          </div>
        </section>

        {/* Notifications */}
        <section className="space-y-md">
          <SectionHeader label="Notifications" hint="When CommitFlex should ping you." />
          <NotificationsCard />
        </section>

        {/* Repositories */}
        <section className="space-y-md">
          <SectionHeader
            label="Connected repositories"
            hint="Repos whose commits power your generations."
          />
          <div className="glass-card rounded-xl overflow-hidden p-lg">
            <RepoManager repos={repos} />
          </div>
          <p className="font-mono text-code-sm text-outline-variant">
            Need to add more? Head to{' '}
            <Link href="/repositories" className="text-primary hover:underline">
              Repositories
            </Link>{' '}or{' '}
            <Link href="/onboarding" className="text-primary hover:underline">
              connect a new one
            </Link>.
          </p>
        </section>

        {/* Danger zone */}
        <section className="space-y-md">
          <SectionHeader label="Danger zone" hint="Irreversible actions. Read carefully." />
          <DangerZoneCard />
        </section>
      </div>
    </AppShell>
  )
}
