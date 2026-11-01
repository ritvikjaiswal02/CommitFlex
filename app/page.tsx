import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { LandingContent } from '@/components/landing-content'
import { detectCurrency } from '@/lib/billing/currency'

export const metadata: Metadata = {
  title: { absolute: 'CommitFlex: your commits, posted' },
  description:
    'CommitFlex turns merged pull requests, releases and weekly commits into LinkedIn and X posts in your own voice, then queues and publishes them for you.',
  openGraph: {
    title: 'CommitFlex: your commits, posted',
    description: 'You shipped it. CommitFlex writes the post, queues it and publishes it.',
    type: 'website',
  },
}

export default async function LandingPage() {
  // Signed-in people reach "/" from bookmarks and the logo; their home is the app.
  const session = await auth()
  if (session?.user?.id) redirect('/dashboard')

  return <LandingContent currency={detectCurrency(headers())} viewer={{ signedIn: false }} />
}
