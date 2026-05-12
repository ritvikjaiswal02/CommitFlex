import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { eq, and } from 'drizzle-orm'
import Link from 'next/link'
import { db } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'
import { getVoiceSettings } from '@/lib/db/queries/voice'
import { getUserRepos } from '@/lib/db/queries/repos'
import { getUserJobs } from '@/lib/db/queries/jobs'
import { VoiceSettingsForm } from '@/components/voice-settings-form'
import { RepoManager } from '@/components/repo-manager'
import { AppShell } from '@/components/app-sidebar'
import {
  AccountCard,
  NotificationsCard,
  PlanCard,
  ApiKeysCard,
  DangerZoneCard,
} from '@/components/settings-account'

const SECTIONS = [
  { id: 'account',       label: 'Account' },
  { id: 'voice',         label: 'Voice profile' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'plan',          label: 'Plan & billing' },
  { id: 'repositories',  label: 'Repositories' },
  { id: 'api',           label: 'API access' },
  { id: 'danger',        label: 'Danger zone' },
]

function SectionHeader({ id, label, hint }: { id: string; label: string; hint?: string }) {
  return (
    <div id={id} className="scroll-mt-margin">
      <h2 className="font-mono text-label-caps uppercase tracking-widest text-primary">{label}</h2>
      {hint && <p className="text-on-surface-variant mt-1">{hint}</p>}
    </div>
  )
}

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const userId = session.user.id

  const [voice, repos, jobs, githubAccount] = await Promise.all([
    getVoiceSettings(userId),
    getUserRepos(userId),
    getUserJobs(userId, 100),
    db.select({ providerAccountId: accounts.providerAccountId, scope: accounts.scope })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.provider, 'github')))
      .limit(1),
  ])

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const generationsThisMonth = jobs.filter(j => j.createdAt >= monthStart).length

  return (
    <AppShell user={{ name: session.user.name, email: session.user.email, image: session.user.image }}>
      <header className="mb-xl">
        <h1 className="font-display text-headline-md font-bold text-on-surface">Settings</h1>
        <p className="text-on-surface-variant mt-1">
          Account, voice, notifications, billing and dangerous things.
        </p>
      </header>

      <div className="grid grid-cols-12 gap-lg">
        {/* Section nav (sticky) */}
        <nav className="hidden lg:block col-span-3">
          <ul className="sticky top-margin space-y-1">
            {SECTIONS.map(s => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="block px-md py-sm rounded-md font-mono text-code-sm uppercase tracking-widest text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-colors"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Sections */}
        <div className="col-span-12 lg:col-span-9 space-y-xl">
          {/* Account */}
          <section className="space-y-md">
            <SectionHeader id="account" label="Account" hint="Profile, connected accounts, and sign-out." />
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
            <SectionHeader id="voice" label="Voice profile" hint="How you write — the AI uses this to match your tone." />
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
            <SectionHeader id="notifications" label="Notifications" hint="When CommitFlex should ping you." />
            <NotificationsCard />
          </section>

          {/* Plan */}
          <section className="space-y-md">
            <SectionHeader id="plan" label="Plan & billing" hint="Your subscription and monthly usage." />
            <PlanCard plan="Community" usage={{ generations: generationsThisMonth, limit: 5 }} />
          </section>

          {/* Repositories */}
          <section className="space-y-md">
            <SectionHeader
              id="repositories"
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

          {/* API */}
          <section className="space-y-md">
            <SectionHeader id="api" label="API access" hint="Programmatic access for power users." />
            <ApiKeysCard />
          </section>

          {/* Danger zone */}
          <section className="space-y-md">
            <SectionHeader id="danger" label="Danger zone" hint="Irreversible actions. Read carefully." />
            <DangerZoneCard />
          </section>
        </div>
      </div>
    </AppShell>
  )
}
