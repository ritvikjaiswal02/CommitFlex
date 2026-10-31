'use client'

import * as React from 'react'
import { ErrorState } from '@/components/ui/error-state'
import { FormSection } from '@/components/ui/form-section'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/toast'
import { patchJson, readError } from '@/components/onboarding/client'

type PrefKey =
  | 'approvalRequests'
  | 'readyToPost'
  | 'publishReceipts'
  | 'emailOnComplete'
  | 'weeklyDigest'
  | 'productUpdates'

type Prefs = Record<PrefKey, boolean>

const DEFAULTS: Prefs = {
  approvalRequests: true,
  readyToPost: true,
  publishReceipts: true,
  emailOnComplete: true,
  weeklyDigest: false,
  productUpdates: false,
}

const GROUPS: { title: string; description: string; rows: { key: PrefKey; label: string; description: string }[] }[] = [
  {
    title: 'Approvals and publishing',
    description: 'The emails that keep autopilot moving. Turning these off means checking the queue yourself.',
    rows: [
      {
        key: 'approvalRequests',
        label: 'Drafts to approve',
        description: 'Each new draft with an Approve button for every platform.',
      },
      {
        key: 'readyToPost',
        label: 'Ready to post',
        description: 'When an X post, or a LinkedIn post without a connection, is ready for one tap.',
      },
      {
        key: 'publishReceipts',
        label: 'Published',
        description: 'A short note with the link after a post goes out.',
      },
    ],
  },
  {
    title: 'Activity',
    description: 'Summaries and news. Emails about your subscription are always sent.',
    rows: [
      {
        key: 'emailOnComplete',
        label: 'Drafts finished',
        description: 'When drafts you started by hand are ready.',
      },
      {
        key: 'weeklyDigest',
        label: 'Weekly summary',
        description: 'A Monday recap of what autopilot drafted and published.',
      },
      {
        key: 'productUpdates',
        label: 'Product updates',
        description: 'New features, at most once a month.',
      },
    ],
  },
]

function toPrefs(raw: Partial<Record<string, unknown>> | null | undefined): Prefs {
  const out = { ...DEFAULTS }
  for (const key of Object.keys(DEFAULTS) as PrefKey[]) {
    if (typeof raw?.[key] === 'boolean') out[key] = raw[key] as boolean
  }
  return out
}

export function NotificationsForm() {
  const [prefs, setPrefs] = React.useState<Prefs | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [attempt, setAttempt] = React.useState(0)
  const [pending, setPending] = React.useState<Set<PrefKey>>(() => new Set())

  React.useEffect(() => {
    let cancelled = false
    setError(null)
    fetch('/api/notifications', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(await readError(res, 'Notification settings didn’t load. Try again.'))
        return (await res.json()) as { prefs?: Record<string, unknown> }
      })
      .then((data) => !cancelled && setPrefs(toPrefs(data.prefs)))
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Notification settings didn’t load. Try again.')
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const toggle = async (key: PrefKey, value: boolean) => {
    if (!prefs) return
    const previous = prefs[key]
    setPrefs({ ...prefs, [key]: value })
    setPending((p) => new Set(p).add(key))
    try {
      const res = await patchJson('/api/notifications', { [key]: value }, 'PUT')
      if (!res.ok) throw new Error(await readError(res, 'Try again in a moment.'))
      const data = (await res.json().catch(() => null)) as { prefs?: Record<string, unknown> } | null
      if (data?.prefs) setPrefs(toPrefs(data.prefs))
    } catch (err) {
      setPrefs((p) => (p ? { ...p, [key]: previous } : p))
      toast.error('Notification setting not saved', {
        description: err instanceof Error ? err.message : 'Check your connection and try again.',
      })
    } finally {
      setPending((p) => {
        const next = new Set(p)
        next.delete(key)
        return next
      })
    }
  }

  if (error) {
    return <ErrorState title="Notification settings didn’t load" description={error} onRetry={() => setAttempt((n) => n + 1)} />
  }

  return (
    <div>
      {GROUPS.map((group, gi) => (
        <React.Fragment key={group.title}>
          {gi > 0 && <Separator />}
          <FormSection title={group.title} description={group.description}>
            <ul className="flex max-w-xl flex-col divide-y divide-line rounded-lg border border-line bg-surface">
              {group.rows.map((row) => {
                const id = `pref-${row.key}`
                return (
                  <li key={row.key} className="flex items-start justify-between gap-4 p-4">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <label htmlFor={id} className="text-sm font-medium text-fg">
                        {row.label}
                      </label>
                      <p id={`${id}-desc`} className="text-sm text-fg-muted">
                        {row.description}
                      </p>
                    </div>
                    {prefs ? (
                      <Switch
                        id={id}
                        checked={prefs[row.key]}
                        disabled={pending.has(row.key)}
                        onCheckedChange={(v) => void toggle(row.key, v)}
                        aria-describedby={`${id}-desc`}
                      />
                    ) : (
                      <Skeleton className="h-5 w-9 rounded-full" />
                    )}
                  </li>
                )
              })}
            </ul>
          </FormSection>
        </React.Fragment>
      ))}
      <p className="mt-6 text-sm text-fg-subtle">Changes save as you switch them.</p>
    </div>
  )
}
