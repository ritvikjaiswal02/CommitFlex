import type { Metadata } from 'next'
import { GitBranch } from 'lucide-react'
import { Logo } from '@/components/brand/logo'
import { ButtonLink } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

export const metadata: Metadata = {
  title: 'Page not found',
}

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex h-14 items-center px-4 sm:px-6">
        <Logo href="/" />
      </header>
      <main id="main" className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md">
          <EmptyState
            align="center"
            icon={GitBranch}
            title="This page doesn't exist"
            description="The link may be old, or the draft or job it pointed to was deleted."
            action={<ButtonLink href="/dashboard">Go to Today</ButtonLink>}
            secondaryAction={
              <ButtonLink href="/" variant="ghost">
                CommitFlex home
              </ButtonLink>
            }
          />
        </div>
      </main>
    </div>
  )
}
