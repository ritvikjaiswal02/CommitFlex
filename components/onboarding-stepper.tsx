'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'

type Step = 'connect' | 'repository' | 'voice' | 'identity'

const STEPS: { key: Step; label: string }[] = [
  { key: 'connect',    label: 'Connect' },
  { key: 'repository', label: 'Repository' },
  { key: 'voice',      label: 'Voice' },
  { key: 'identity',   label: 'Identity' },
]

interface GithubRepo {
  githubRepoId: string
  name: string
  fullName: string
  url: string
  defaultBranch: string
  isPrivate: boolean
  description: string | null
  language: string | null
  updatedAt: string | null
  stars?: number
}

const PERSONA_OPTIONS = [
  { key: 'technical', label: 'Technical',   icon: '⚙' },
  { key: 'founder',   label: 'Founder',     icon: '🚀' },
  { key: 'educator',  label: 'Educational', icon: '📘' },
  { key: 'casual',    label: 'Casual',      icon: '💬' },
  { key: 'builder',   label: 'Builder',     icon: '🔨' },
]

const PERSONA_TO_TONE: Record<string, string> = {
  technical: 'analytical',
  founder:   'enthusiastic',
  educator:  'storytelling',
  casual:    'casual',
  builder:   'professional',
}

interface OnboardingStepperProps {
  isAuthenticated: boolean
  defaultTone?: string
  defaultExtraContext?: string
}

export function OnboardingStepper({ isAuthenticated, defaultTone, defaultExtraContext }: OnboardingStepperProps) {
  const router = useRouter()

  // Determine starting step
  const [step, setStep] = useState<Step>(isAuthenticated ? 'repository' : 'connect')

  // Repository state
  const [repos, setRepos] = useState<GithubRepo[]>([])
  const [reposLoading, setReposLoading] = useState(false)
  const [reposError, setReposError] = useState<string | null>(null)
  const [selectedRepoIds, setSelectedRepoIds] = useState<Set<string>>(new Set())
  const [repoQuery, setRepoQuery] = useState('')

  // Voice/Identity
  const personaFromTone = Object.entries(PERSONA_TO_TONE).find(([, t]) => t === defaultTone)?.[0] ?? 'technical'
  const [persona, setPersona] = useState<string>(personaFromTone)
  const [extraContext, setExtraContext] = useState(defaultExtraContext ?? '')
  const [markdownOn, setMarkdownOn] = useState(true)
  const [noJargon, setNoJargon] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Load repos when we reach the repository step
  useEffect(() => {
    if (step !== 'repository' || repos.length || reposLoading || !isAuthenticated) return
    setReposLoading(true)
    fetch('/api/github/repos')
      .then(r => r.json())
      .then(data => {
        if (data.repos) setRepos(data.repos)
        else setReposError(data.error ?? 'Failed to load repos')
      })
      .catch(() => setReposError('Failed to load repositories'))
      .finally(() => setReposLoading(false))
  }, [step, isAuthenticated, repos.length, reposLoading])

  const stepIndex = STEPS.findIndex(s => s.key === step)
  const filteredRepos = repos.filter(r => r.fullName.toLowerCase().includes(repoQuery.toLowerCase()))

  const toggleRepo = (id: string) => {
    setSelectedRepoIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const next = () => {
    const i = STEPS.findIndex(s => s.key === step)
    if (i < STEPS.length - 1) setStep(STEPS[i + 1].key)
  }
  const prev = () => {
    const i = STEPS.findIndex(s => s.key === step)
    if (i > 0) setStep(STEPS[i - 1].key)
  }

  const canNext =
    step === 'connect'    ? isAuthenticated :
    step === 'repository' ? selectedRepoIds.size > 0 :
    step === 'voice'      ? !!persona :
                            true

  const handleFinish = async () => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      // 1. Connect each selected repo
      const selected = repos.filter(r => selectedRepoIds.has(r.githubRepoId))
      for (const r of selected) {
        const res = await fetch('/api/repos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            githubRepoId: r.githubRepoId,
            name: r.name,
            fullName: r.fullName,
            url: r.url,
            defaultBranch: r.defaultBranch,
            isPrivate: r.isPrivate,
          }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error ?? `Failed to connect ${r.fullName}`)
        }
      }

      // 2. Save voice settings
      const tone = PERSONA_TO_TONE[persona] ?? 'professional'
      const ctxBits: string[] = []
      if (markdownOn) ctxBits.push('Use markdown formatting.')
      if (noJargon) ctxBits.push('Avoid jargon.')
      const composedContext = [extraContext.trim(), ctxBits.join(' ')].filter(Boolean).join('\n\n')

      const voiceRes = await fetch('/api/voice', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tone,
          technicalLevel: persona === 'technical' ? 9 : persona === 'casual' ? 4 : 7,
          audience: persona === 'founder' ? 'engineering leaders' : persona === 'educator' ? 'general tech' : 'developers',
          extraContext: composedContext,
        }),
      })
      if (!voiceRes.ok) throw new Error('Failed to save voice profile')

      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="w-full max-w-[720px] mx-auto">
      {/* Stepper */}
      <div className="flex items-center gap-md justify-center mb-xl">
        {STEPS.map((s, i) => {
          const done = i < stepIndex
          const current = i === stepIndex
          return (
            <div key={s.key} className="flex items-center gap-md">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`font-mono text-label-caps uppercase tracking-widest transition-colors ${
                    current ? 'text-primary' : done ? 'text-on-surface' : 'text-outline-variant'
                  }`}
                >
                  {s.label}
                </div>
                <div
                  className={`h-[2px] w-16 rounded-full transition-colors ${
                    current ? 'bg-primary' : done ? 'bg-on-surface/40' : 'bg-white/8'
                  }`}
                />
              </div>
              {i < STEPS.length - 1 && <span className="text-outline-variant">·</span>}
            </div>
          )
        })}
      </div>

      <div className="text-center mb-xl">
        <h1 className="font-display text-display-lg font-bold text-on-surface tracking-tighter">
          Initialize <span className="text-primary">CommitFlex</span>
        </h1>
        <p className="text-on-surface-variant mt-sm max-w-md mx-auto">
          Connect your GitHub account so we can read your commits and generate posts in your voice.
        </p>
      </div>

      {/* Step body */}
      <div className="space-y-lg">
        {step === 'connect' && (
          <div className="glass-card rounded-xl p-xl flex flex-col items-center gap-md">
            <button
              onClick={() => signIn('github', { callbackUrl: '/onboarding' })}
              className="btn-primary-solid h-12 px-6 rounded-xl text-sm flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
              Continue with GitHub
            </button>
            <p className="font-mono text-code-sm text-outline-variant">
              Read-only access · No writes to your repos
            </p>
          </div>
        )}

        {step === 'repository' && (
          <div className="space-y-md">
            <div className="flex items-baseline justify-between">
              <div>
                <h2 className="font-display text-headline-md font-bold text-on-surface">Select Repositories</h2>
                <p className="text-on-surface-variant text-code-sm mt-1">
                  We&apos;ll index these to build your custom knowledge base.
                </p>
              </div>
              <span className="font-mono text-label-caps uppercase tracking-widest text-primary">
                {selectedRepoIds.size} selected
              </span>
            </div>

            <input
              value={repoQuery}
              onChange={e => setRepoQuery(e.target.value)}
              placeholder="Search repositories..."
              className="w-full rounded-lg bg-transparent border border-white/8 px-md py-sm text-sm font-mono text-on-surface placeholder:text-outline-variant focus:outline-none focus:border-primary/50 transition-colors"
            />

            {reposLoading && (
              <div className="flex items-center justify-center py-12 gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot" />
                <span className="font-mono text-code-sm uppercase tracking-widest text-on-surface-variant">Fetching</span>
              </div>
            )}
            {reposError && <p className="font-mono text-code-sm text-error">{reposError}</p>}

            <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
              {filteredRepos.map(r => {
                const selected = selectedRepoIds.has(r.githubRepoId)
                return (
                  <button
                    key={r.githubRepoId}
                    type="button"
                    onClick={() => toggleRepo(r.githubRepoId)}
                    className={`w-full text-left rounded-lg border p-md flex items-center justify-between gap-md transition-colors ${
                      selected
                        ? 'border-primary/50 bg-primary/5'
                        : 'border-white/8 hover:border-white/20 hover:bg-white/[0.03]'
                    }`}
                  >
                    <div className="flex items-center gap-md min-w-0">
                      <span className="text-on-surface-variant shrink-0">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776"/></svg>
                      </span>
                      <div className="min-w-0">
                        <p className="font-mono text-sm text-on-surface truncate">{r.fullName}</p>
                        <p className="font-mono text-code-sm text-on-surface-variant mt-0.5">
                          {r.language ? `★ ${r.language} · ` : ''}{r.updatedAt ? `Updated ${new Date(r.updatedAt).toLocaleDateString()}` : ''}
                        </p>
                      </div>
                    </div>
                    <span className={`shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                      selected ? 'bg-primary border-primary' : 'border-white/20'
                    }`}>
                      {selected && (
                        <svg className="w-3 h-3 text-on-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      )}
                    </span>
                  </button>
                )
              })}
              {!reposLoading && filteredRepos.length === 0 && (
                <p className="text-center text-on-surface-variant py-6 font-mono text-code-sm">
                  No matching repositories.
                </p>
              )}
            </div>
          </div>
        )}

        {step === 'voice' && (
          <div className="space-y-md">
            <div>
              <h2 className="font-display text-headline-md font-bold text-on-surface">Persona Engine</h2>
              <p className="text-on-surface-variant text-code-sm mt-1">
                Define the tone and vocabulary used in generated outputs.
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-sm">
              {PERSONA_OPTIONS.map(p => {
                const active = persona === p.key
                return (
                  <button
                    key={p.key}
                    onClick={() => setPersona(p.key)}
                    className={`rounded-lg border px-md py-md flex flex-col items-center gap-1 transition-colors ${
                      active
                        ? 'border-primary/50 bg-primary/10 text-primary'
                        : 'border-white/8 hover:border-white/20 text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <span className="text-xl">{p.icon}</span>
                    <span className="font-mono text-code-sm uppercase tracking-widest">{p.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {step === 'identity' && (
          <div className="space-y-md">
            <div>
              <h2 className="font-display text-headline-md font-bold text-on-surface">Writing Identity</h2>
              <p className="text-on-surface-variant text-code-sm mt-1">
                Provide specific nuances, taboos, or preferred styles unique to your brand.
              </p>
            </div>
            <div className="space-y-1">
              <label className="font-mono text-label-caps uppercase tracking-widest text-on-surface-variant">
                Prompt_suffix
              </label>
              <textarea
                value={extraContext}
                onChange={e => setExtraContext(e.target.value)}
                placeholder="e.g. Always use concise sentences. Avoid passive voice. Reference our DevExperience or User Impact when relevant."
                rows={6}
                maxLength={2000}
                className="w-full rounded-lg bg-surface-container-low border border-white/8 px-md py-sm text-sm font-mono text-on-surface placeholder:text-outline-variant focus:outline-none focus:border-primary/50 transition-colors resize-none"
              />
              <div className="flex items-center justify-between pt-1">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setMarkdownOn(v => !v)}
                    className={`chip ${markdownOn ? 'chip-primary' : 'chip-secondary opacity-60'}`}
                  >
                    Markdown
                  </button>
                  <button
                    type="button"
                    onClick={() => setNoJargon(v => !v)}
                    className={`chip ${noJargon ? 'chip-primary' : 'chip-secondary opacity-60'}`}
                  >
                    No Jargon
                  </button>
                </div>
                <span className="font-mono text-code-sm text-outline-variant">
                  {extraContext.length} / 2000
                </span>
              </div>
            </div>
          </div>
        )}

        {submitError && (
          <p className="font-mono text-code-sm text-error">{submitError}</p>
        )}
      </div>

      {/* Footer nav */}
      <div className="flex items-center justify-between mt-xl pt-md border-t border-white/8">
        <button
          onClick={prev}
          disabled={stepIndex === 0}
          className="font-mono text-code-sm uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-colors disabled:opacity-30"
        >
          ← Back to previous
        </button>
        {step === 'identity' ? (
          <button
            onClick={handleFinish}
            disabled={submitting || selectedRepoIds.size === 0}
            className="btn-primary-solid h-11 px-6 rounded-xl text-sm disabled:opacity-50"
          >
            {submitting ? 'Finishing...' : 'Finish Onboarding'}
          </button>
        ) : (
          <button
            onClick={next}
            disabled={!canNext}
            className="btn-primary-solid h-11 px-6 rounded-xl text-sm disabled:opacity-50"
          >
            Continue →
          </button>
        )}
      </div>
    </div>
  )
}
