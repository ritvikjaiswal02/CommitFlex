import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { AppShell } from '@/components/app-shell'

export const metadata: Metadata = {
  title: 'Billing',
  description: 'Your CommitFlex plan, usage and invoices.',
}

/** The app frame for /billing, so the loading skeleton renders inside the shell. */
export default async function BillingLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login?next=/billing')

  return <AppShell user={{ ...session.user, id: session.user.id }}>{children}</AppShell>
}
