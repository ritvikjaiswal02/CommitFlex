'use server'

import { signIn } from '@/auth'
import { safeRedirect } from '@/components/landing/pricing/pricing-logic'

/**
 * Starts GitHub OAuth from a plain <form>, so the marketing pages need no
 * client JavaScript to sign someone in. New accounts land on /dashboard,
 * which sends them to /onboarding until it is finished.
 */
export async function startWithGitHub(formData: FormData): Promise<void> {
  const next = safeRedirect(formData.get('next'))
  await signIn('github', { redirectTo: next })
}
