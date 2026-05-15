'use client'

import { signIn } from 'next-auth/react'
import { useState } from 'react'

function GitHubIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}

const COMMITS = [
  { hash: 'a3f2c1d', color: '#86efac', message: 'feat: add GitHub OAuth + session handling' },
  { hash: 'b7e8a2f', color: '#ffb869', message: 'fix: rate limiting on commit fetch endpoint' },
  { hash: 'c4d1e9a', color: '#d0bcff', message: 'refactor: extract pipeline into stages' },
  { hash: 'f2a8b3c', color: '#adc6ff', message: 'feat: real-time streaming via SSE' },
]

export default function LoginPage() {
  const [loading, setLoading] = useState(false)

  const handleSignIn = async () => {
    setLoading(true)
    await signIn('github', { callbackUrl: '/dashboard' })
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden cf-grid-bg bg-background">
      {/* Drifting aurora — adds depth without movement */}
      <div className="absolute inset-0 cf-aurora pointer-events-none" />
      {/* Concentrated glow behind the logo */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none w-[720px] h-[480px] cf-glow-primary" />

      <div className="relative z-10 w-full max-w-[440px] px-5 animate-slide-up">
        {/* Logo */}
        <div className="text-center mb-xl">
          <div className="inline-flex items-center gap-2 chip chip-primary mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot" />
            ship in public · post with signal
          </div>
          <h1 className="font-display text-[50px] font-bold tracking-[-0.04em] leading-none mb-3 text-on-surface">
            Commit<span className="text-primary">Flex</span>
          </h1>
          <p className="text-on-surface-variant leading-relaxed">
            GitHub commits → authentic social posts<br />in your voice, automatically.
          </p>
        </div>

        {/* Terminal commit preview */}
        <div className="glass-card rounded-xl mb-7 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/8">
            <div className="flex gap-1.5">
              {['#ffb4ab', '#ffb869', '#86efac'].map(c => (
                <div key={c} className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
              ))}
            </div>
            <span className="font-mono text-code-sm ml-2 text-outline-variant">
              git log --oneline
            </span>
          </div>
          <div className="p-3 space-y-0.5">
            {COMMITS.map((c) => (
              <div
                key={c.hash}
                className="flex items-center gap-2.5 px-2 py-1.5 rounded-md transition-colors hover:bg-white/[0.03]"
              >
                <span className="font-mono text-code-sm shrink-0 w-14" style={{ color: c.color }}>
                  {c.hash}
                </span>
                <span className="font-mono text-code-sm truncate text-on-surface-variant">
                  {c.message}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 px-4 py-3 border-t border-white/8 font-mono text-code-sm text-primary">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot shrink-0" />
            generating 2 posts from this week
            <span className="animate-blink ml-0.5">▋</span>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={handleSignIn}
          disabled={loading}
          className="btn-primary-solid w-full h-12 rounded-xl text-sm flex items-center justify-center gap-2.5 disabled:opacity-60"
        >
          <GitHubIcon />
          {loading ? 'Connecting to GitHub...' : 'Continue with GitHub'}
        </button>

        <p className="text-center font-mono text-code-sm mt-md text-outline-variant">
          Read-only access · No writes to your repos
        </p>
      </div>
    </div>
  )
}
