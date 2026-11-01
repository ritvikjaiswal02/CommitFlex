'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Play } from 'lucide-react'
import { Button, type ButtonSize, type ButtonVariant } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { useUpgrade } from '@/components/billing/upgrade-provider'

export interface RunAutopilotButtonProps {
  repoId?: string
  label?: string
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
}

/**
 * Starts an autopilot run now (`POST /api/autopilot/run`) for the most
 * recently active repo, or `repoId`. The drafts land in the queue.
 */
export function RunAutopilotButton({
  repoId,
  label = 'Run autopilot now',
  variant = 'secondary',
  size = 'md',
  className,
}: RunAutopilotButtonProps) {
  const router = useRouter()
  const { handlePlanError } = useUpgrade()
  const [running, setRunning] = React.useState(false)

  const run = async () => {
    setRunning(true)
    try {
      const res = await fetch('/api/autopilot/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(repoId ? { repoId } : {}),
      })
      if (res.status === 402 && (await handlePlanError(res))) return
      const body = (await res.json().catch(() => ({}))) as { jobId?: string; error?: string; code?: string }
      if (res.status === 409 && body.jobId) {
        toast.info('Autopilot is already writing drafts for this repo', {
          action: { label: 'Watch progress', onClick: () => router.push(`/jobs/${body.jobId}`) },
        })
        return
      }
      if (!res.ok || !body.jobId) {
        toast.error("Autopilot didn't start", {
          description:
            body.code === 'not_found'
              ? 'Turn on autopilot for at least one repository first.'
              : body.error ?? 'Try again in a moment.',
        })
        return
      }
      const jobId = body.jobId
      toast.success('Autopilot is writing drafts', {
        description: 'They land in your queue for review in a minute or two.',
        action: { label: 'Watch progress', onClick: () => router.push(`/jobs/${jobId}`) },
      })
      router.refresh()
    } catch {
      toast.error("Autopilot didn't start", { description: 'Check your connection and try again.' })
    } finally {
      setRunning(false)
    }
  }

  return (
    <Button variant={variant} size={size} onClick={run} loading={running} className={className}>
      {!running && <Play strokeWidth={1.75} aria-hidden="true" />}
      {label}
    </Button>
  )
}
