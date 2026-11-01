'use client'

import * as React from 'react'
import { signIn } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { PlatformIcon } from '@/components/brand/platform'

/** Starts GitHub OAuth and comes back to `callbackUrl`. */
export function SignInButton({ callbackUrl }: { callbackUrl: string }) {
  const [pending, setPending] = React.useState(false)

  // A user who presses Back from GitHub lands here from the bfcache with the
  // button still spinning; reset it.
  React.useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setPending(false)
    }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [])

  return (
    <Button
      size="lg"
      className="w-full"
      loading={pending}
      onClick={() => {
        setPending(true)
        void signIn('github', { callbackUrl }).catch(() => setPending(false))
      }}
    >
      {!pending && <PlatformIcon platform="github" className="size-[18px]" />}
      {pending ? 'Opening GitHub' : 'Continue with GitHub'}
    </Button>
  )
}
