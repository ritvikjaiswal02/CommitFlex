'use client'

import { useEffect } from 'react'
import { Logo } from '@/components/brand/logo'
import { ButtonLink } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Unhandled error:', error)
  }, [error])

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex h-14 items-center px-4 sm:px-6">
        <Logo href="/" />
      </header>
      <main id="main" className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md">
          <ErrorState
            align="center"
            title="This page hit an error"
            description={
              <>
                Something on our side failed while loading it. Try again, and if it keeps happening,
                go back to Today and retry from there.
                {error.digest && (
                  <span className="mt-3 block text-xs text-fg-subtle">
                    Reference <code className="font-mono">{error.digest}</code>
                  </span>
                )}
              </>
            }
            onRetry={reset}
            action={
              <ButtonLink href="/dashboard" variant="ghost">
                Go to Today
              </ButtonLink>
            }
          />
        </div>
      </main>
    </div>
  )
}
