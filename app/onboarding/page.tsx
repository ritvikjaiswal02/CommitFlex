import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getUserProfile } from '@/lib/db/queries/onboarding'
import { OnboardingStepper, type LinkedInReturn } from '@/components/onboarding-stepper'
import { AddReposFlow } from '@/components/onboarding/add-repos'

export const metadata: Metadata = {
  title: 'Set up autopilot',
  description: 'Pick the repos to watch and answer five questions. CommitFlex does the rest.',
}

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams?: { add?: string; linkedin?: string }
}

function linkedinReturn(value: string | undefined): LinkedInReturn {
  return value === 'connected' || value === 'denied' || value === 'error' ? value : null
}

export default async function OnboardingPage({ searchParams }: PageProps) {
  const session = await auth()
  const user = session?.user
  if (!user?.id) {
    const next = searchParams?.add === '1' ? '/onboarding?add=1' : '/onboarding'
    redirect(`/login?next=${encodeURIComponent(next)}`)
  }

  let onboarded = false
  try {
    const profile = await getUserProfile(user.id)
    onboarded = !!profile?.onboardedAt
  } catch (err) {
    // The stepper loads its own state and shows a retry if the database is down.
    console.error('[onboarding] profile lookup failed', err)
  }

  if (searchParams?.add === '1') {
    if (!onboarded) redirect('/onboarding')
    return <AddReposFlow />
  }

  if (onboarded) redirect('/dashboard')

  return (
    <OnboardingStepper
      user={{ name: user.name, image: user.image, email: user.email, login: user.login ?? null }}
      linkedinReturn={linkedinReturn(searchParams?.linkedin)}
    />
  )
}
