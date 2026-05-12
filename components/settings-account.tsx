'use client'

import { useState } from 'react'
import { signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'

interface AccountInfo {
  name: string | null | undefined
  email: string | null | undefined
  image?: string | null
  githubUsername?: string | null
  joinedAt?: Date | string | null
}

export function AccountCard({ info }: { info: AccountInfo }) {
  const [signingOut, setSigningOut] = useState(false)

  const handleSignOut = async () => {
    setSigningOut(true)
    await signOut({ callbackUrl: '/' })
  }

  const initial = (info.name ?? info.email ?? '?').charAt(0).toUpperCase()

  return (
    <div className="glass-card rounded-xl p-lg flex flex-col md:flex-row md:items-center gap-lg">
      {/* Avatar */}
      <div className="w-16 h-16 rounded-full bg-primary/20 ring-1 ring-primary/30 flex items-center justify-center overflow-hidden shrink-0">
        {info.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={info.image} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="font-display text-2xl font-bold text-primary">{initial}</span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 space-y-1">
        <p className="font-display text-base font-bold text-on-surface truncate">
          {info.name ?? info.email?.split('@')[0] ?? 'Anonymous'}
        </p>
        <p className="font-mono text-code-sm text-on-surface-variant truncate">
          {info.email ?? 'No email on file'}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <span className="chip chip-secondary normal-case">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            GitHub Connected
          </span>
          {info.githubUsername && (
            <span className="font-mono text-code-sm text-on-surface-variant">
              @{info.githubUsername}
            </span>
          )}
        </div>
      </div>

      {/* Sign out */}
      <button
        onClick={handleSignOut}
        disabled={signingOut}
        className="btn-ghost h-10 px-4 rounded-xl font-mono text-label-caps uppercase tracking-widest text-on-surface-variant hover:text-on-surface disabled:opacity-50 inline-flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"/>
        </svg>
        {signingOut ? 'Signing out...' : 'Sign out'}
      </button>
    </div>
  )
}

interface PrefsState {
  emailOnComplete: boolean
  weeklyDigest: boolean
  productUpdates: boolean
}

export function NotificationsCard() {
  // Local-only preferences for now — schema doesn't track these yet.
  const [prefs, setPrefs] = useState<PrefsState>({
    emailOnComplete: true,
    weeklyDigest: false,
    productUpdates: false,
  })

  const toggle = (k: keyof PrefsState) => setPrefs(p => ({ ...p, [k]: !p[k] }))

  const rows: { key: keyof PrefsState; title: string; desc: string }[] = [
    { key: 'emailOnComplete', title: 'Generation completed',   desc: 'Email me when a job finishes.' },
    { key: 'weeklyDigest',    title: 'Weekly digest',          desc: 'Roundup of last week’s drafts every Monday.' },
    { key: 'productUpdates',  title: 'Product updates',        desc: 'Occasional news about new features.' },
  ]

  return (
    <div className="glass-card rounded-xl p-lg space-y-md">
      {rows.map(r => (
        <label key={r.key} className="flex items-center justify-between gap-md cursor-pointer">
          <div>
            <p className="text-sm text-on-surface">{r.title}</p>
            <p className="font-mono text-code-sm text-on-surface-variant mt-0.5">{r.desc}</p>
          </div>
          <button
            type="button"
            onClick={() => toggle(r.key)}
            aria-pressed={prefs[r.key]}
            className={`relative h-6 w-11 rounded-full transition-colors shrink-0 ${
              prefs[r.key] ? 'bg-primary' : 'bg-white/10'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                prefs[r.key] ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </label>
      ))}
      <p className="font-mono text-code-sm text-outline-variant pt-2 border-t border-white/8">
        Stored locally for now — server-side delivery rolling out soon.
      </p>
    </div>
  )
}

export function PlanCard({ plan = 'Community', usage }: { plan?: string; usage?: { generations: number; limit: number } }) {
  const u = usage ?? { generations: 0, limit: 5 }
  const pct = Math.min(100, (u.generations / u.limit) * 100)
  const isPro = plan.toLowerCase() === 'pro'

  return (
    <div className={`relative glass-card rounded-xl p-lg overflow-hidden ${isPro ? 'bg-gradient-to-br from-primary/10 to-transparent border-primary/30' : ''}`}>
      <div className="flex items-start justify-between gap-md">
        <div>
          <p className="font-mono text-label-caps uppercase tracking-widest text-on-surface-variant">Current Plan</p>
          <p className="font-display text-headline-md font-bold tracking-tighter text-on-surface mt-1">
            {plan}
          </p>
          {!isPro && (
            <p className="text-code-sm text-on-surface-variant mt-1">
              Free forever for hobbyists. Upgrade for unlimited.
            </p>
          )}
        </div>
        {!isPro && (
          <button className="bg-primary text-on-primary font-bold rounded-md px-4 py-2 text-xs hover:bg-primary-container transition-colors shrink-0">
            Upgrade to Pro
          </button>
        )}
      </div>

      <div className="mt-md pt-md border-t border-white/8">
        <div className="flex justify-between font-mono text-code-sm mb-1">
          <span className="text-on-surface-variant">Generations this month</span>
          <span className="text-on-surface">{u.generations} / {isPro ? '∞' : u.limit}</span>
        </div>
        {!isPro && (
          <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    </div>
  )
}

export function ApiKeysCard() {
  return (
    <div className="glass-card rounded-xl p-lg space-y-md">
      <div className="flex items-center justify-between gap-md">
        <div>
          <p className="text-sm text-on-surface">Personal API key</p>
          <p className="font-mono text-code-sm text-on-surface-variant mt-0.5">
            Programmatic access to your generations.
          </p>
        </div>
        <button
          disabled
          className="btn-ghost h-9 px-3 rounded-md font-mono text-label-caps uppercase opacity-50 cursor-not-allowed"
        >
          Generate Key
        </button>
      </div>
      <div className="rounded-md border border-white/8 p-sm font-mono text-code-sm text-outline-variant">
        cf_•••• •••• •••• •••• <span className="text-primary/60">(available on Pro)</span>
      </div>
    </div>
  )
}

export function DangerZoneCard() {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async () => {
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch('/api/user', { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to delete account')
      }
      // Also clear client-side session and redirect
      await signOut({ callbackUrl: '/' })
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setDeleting(false)
    }
  }

  return (
    <div className="rounded-xl border border-error/30 bg-error/5 p-lg space-y-md">
      <div className="flex items-start justify-between gap-md">
        <div>
          <p className="text-sm text-on-surface font-bold">Delete account</p>
          <p className="font-mono text-code-sm text-on-surface-variant mt-0.5">
            Permanently remove your account, repos, jobs and drafts. This cannot be undone.
          </p>
        </div>
        {!confirming && (
          <button
            onClick={() => setConfirming(true)}
            className="btn-ghost h-9 px-3 rounded-md font-mono text-label-caps uppercase text-error border-error/40 hover:bg-error/10"
          >
            Delete account
          </button>
        )}
      </div>

      {confirming && (
        <div className="space-y-sm pt-sm border-t border-error/20">
          <p className="font-mono text-code-sm text-on-surface">
            Type <span className="text-error font-bold">DELETE</span> to confirm.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder="DELETE"
              className="flex-1 rounded-md bg-transparent border border-error/30 px-md py-sm text-sm font-mono text-on-surface placeholder:text-outline-variant focus:outline-none focus:border-error/60"
            />
            <button
              onClick={handleDelete}
              disabled={confirmText !== 'DELETE' || deleting}
              className="h-10 px-4 rounded-md font-mono text-label-caps uppercase bg-error/20 text-error border border-error/40 hover:bg-error/30 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {deleting ? 'Deleting...' : 'Confirm delete'}
            </button>
            <button
              onClick={() => { setConfirming(false); setConfirmText('') }}
              disabled={deleting}
              className="h-10 px-4 rounded-md font-mono text-label-caps uppercase text-on-surface-variant hover:text-on-surface"
            >
              Cancel
            </button>
          </div>
          {error && <p className="font-mono text-code-sm text-error">{error}</p>}
        </div>
      )}
    </div>
  )
}
