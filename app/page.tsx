import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { LandingContent } from '@/components/landing-content'

export default async function LandingPage() {
  const session = await auth()
  if (session?.user?.id) redirect('/dashboard')
  return <LandingContent />
}
