import * as React from 'react'
import type { LinkedInConnectionSummary } from '@/types/autopilot'
import { ButtonLink } from '@/components/ui/button'
import { Callout } from '@/components/ui/callout'

/**
 * Reconnect banner for an expired or revoked LinkedIn connection
 * (PRODUCT_SPEC §5 Flow K). Renders nothing while the connection is active.
 */
export function LinkedInBanner({
  linkedin,
  returnTo,
  className,
}: {
  linkedin: LinkedInConnectionSummary | null
  returnTo: string
  className?: string
}) {
  if (!linkedin || linkedin.status === 'active') return null
  const href = `/api/integrations/linkedin/connect?returnTo=${encodeURIComponent(returnTo)}`
  return (
    <Callout
      tone="warning"
      title={linkedin.status === 'expired' ? 'Your LinkedIn connection expired' : 'LinkedIn was disconnected'}
      className={className}
      action={
        <ButtonLink href={href} size="sm" variant="secondary" prefetch={false}>
          Reconnect LinkedIn
        </ButtonLink>
      }
    >
      LinkedIn posts wait in Ready to post until you reconnect, so nothing is lost. Reconnect and scheduled posts
      publish on their own again.
    </Callout>
  )
}
