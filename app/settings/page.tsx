import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { AppShell } from '@/components/app-shell'
import { PageHeader } from '@/components/ui/page-header'
import { ErrorState } from '@/components/ui/error-state'
import { getUserPlan, limitFor } from '@/lib/plans'
import { getUserProfile } from '@/lib/db/queries/onboarding'
import { listVoiceProfiles } from '@/lib/db/queries/voice'
import { getLinkedInConnectionSummary } from '@/lib/db/queries/integrations'
import { settle } from '@/components/app/server-context'
import { SettingsTabs, isSettingsTab, type SettingsTab } from '@/components/settings/settings-tabs'
import { ProfileForm } from '@/components/settings/profile-form'
import { AutopilotForm } from '@/components/settings/autopilot-form'
import { ConnectionsPanel } from '@/components/settings/connections-panel'
import { NotificationsForm } from '@/components/settings/notifications-form'
import { VoiceProfileManager } from '@/components/voice-profile-manager'
import { AccountPanel } from '@/components/settings-account'

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Your profile, voice, autopilot schedule, connections and notifications.',
}

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams?: { tab?: string; linkedin?: string }
}

export default async function SettingsPage({ searchParams }: PageProps) {
  const session = await auth()
  const user = session?.user
  if (!user?.id) redirect('/login?next=%2Fsettings')
  const userId = user.id

  const profileResult = await settle(getUserProfile(userId), 'getUserProfile')
  if (profileResult.ok && !profileResult.value?.onboardedAt) redirect('/onboarding')

  const [planResult, voicesResult, linkedinResult] = await Promise.all([
    settle(getUserPlan(userId), 'getUserPlan'),
    settle(listVoiceProfiles(userId), 'listVoiceProfiles'),
    settle(getLinkedInConnectionSummary(userId), 'getLinkedInConnectionSummary'),
  ])

  const shellUser = { id: userId, name: user.name, email: user.email, image: user.image }
  if (!profileResult.ok || !planResult.ok || !voicesResult.ok || !profileResult.value) {
    return (
      <AppShell user={shellUser}>
        <PageHeader title="Settings" description="Your profile, voice, schedule, connections and notifications." />
        <div className="rounded-lg border border-line bg-surface px-5">
          <ErrorState
            title="Settings didn't load"
            description="We couldn't reach the database. Reload the page in a moment; nothing you saved was lost."
          />
        </div>
      </AppShell>
    )
  }

  const profile = profileResult.value
  const plan = planResult.value
  // An account without a voice profile gets its default created lazily by
  // the voice editor (a server action), never during this render.
  const voices = voicesResult.value
  const linkedin = linkedinResult.ok ? linkedinResult.value : null

  const requestedTab = searchParams?.tab
  const tab: SettingsTab = isSettingsTab(requestedTab) ? requestedTab : 'profile'
  const linkedinReturn = searchParams?.linkedin ?? null
  const userView = { name: user.name ?? null, email: user.email ?? null, image: user.image ?? null }
  const voiceViews = voices.map((v) => ({
    id: v.id,
    name: v.name,
    isDefault: v.isDefault,
    tone: v.tone,
    technicalLevel: v.technicalLevel,
    audience: v.audience,
    extraContext: v.extraContext ?? null,
  }))

  return (
    <AppShell user={shellUser}>
      <PageHeader title="Settings" description="Your profile, voice, schedule, connections and notifications." />
      <SettingsTabs
        initialTab={tab}
        linkedinReturn={linkedinReturn}
        counts={{ connections: linkedin && linkedin.status !== 'active' ? 1 : 0 }}
        panels={{
          profile: (
            <ProfileForm
              user={userView}
              profile={{
                role: profile.role,
                pitch: profile.pitch,
                audiences: profile.audiences ?? [],
                timezone: profile.timezone,
              }}
            />
          ),
          voice: <VoiceProfileManager initialProfiles={voiceViews} maxProfiles={limitFor(plan.id, 'voiceProfiles')} />,
          autopilot: (
            <AutopilotForm voiceProfiles={voiceViews.map(({ id, name, isDefault }) => ({ id, name, isDefault }))} />
          ),
          connections: <ConnectionsPanel />,
          notifications: <NotificationsForm />,
          account: (
            <AccountPanel
              user={userView}
              joinedAt={profile.createdAt ? new Date(profile.createdAt).toISOString() : null}
              plan={{
                id: plan.id,
                status: plan.status,
                trialEndsAt: plan.trialEndsAt ? new Date(plan.trialEndsAt).toISOString() : null,
                currentPeriodEnd: plan.currentPeriodEnd ? new Date(plan.currentPeriodEnd).toISOString() : null,
              }}
            />
          ),
        }}
      />
    </AppShell>
  )
}
