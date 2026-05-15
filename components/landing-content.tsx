'use client'

import { signIn } from 'next-auth/react'
import Link from 'next/link'

function GitHubIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}

const PIPELINE = [
  { n: '01', tag: 'SOURCE',  title: 'Sync Repo',     body: 'Connect any public or private GitHub repository via OAuth in seconds.' },
  { n: '02', tag: 'ANALYZE', title: 'Semantic Pull', body: 'Our LLM parses your diffs and PR descriptions to understand the "why" behind the code.' },
  { n: '03', tag: 'REFINE',  title: 'Persona Match', body: 'We adapt the tone to your developer persona — be it academic, casual, or hype-driven.' },
  { n: '04', tag: 'SHIP',    title: 'Auto-Draft',    body: 'Receive a Discord ping with a pre-written draft ready to publish globally.' },
]

const TESTIMONIALS = [
  {
    quote: 'I haven\'t manually written a "ship" post in 3 months. CommitFlex captures the technical nuance better than I can when I\'m tired after a release.',
    name: '@sarah_dev',
    role: 'Senior Engineer',
  },
  {
    quote: 'Authenticity is hard at scale. CommitFlex actually understands my code logic and translates it into narratives people engage with.',
    name: '@marcus_tech',
    role: 'Founder @ NeonFlow',
  },
]

export function LandingContent() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top nav */}
      <header className="sticky top-0 z-30 border-b border-white/8 backdrop-blur-md bg-background/80">
        <div className="max-w-7xl mx-auto px-margin py-md flex items-center justify-between">
          <Link href="/" className="font-display text-base font-bold tracking-tighter text-on-surface">
            Commit<span className="text-primary">Flex</span>
          </Link>
          <nav className="hidden md:flex items-center gap-lg font-mono text-code-sm text-on-surface-variant">
            <a href="#how" className="hover:text-on-surface transition-colors">How It Works</a>
            <a href="#" className="hover:text-on-surface transition-colors">Docs</a>
          </nav>
          <div className="flex items-center gap-sm">
            <Link
              href="/login"
              className="font-mono text-code-sm text-on-surface-variant hover:text-on-surface transition-colors px-3"
            >
              Sign In
            </Link>
            <button
              onClick={() => signIn('github', { callbackUrl: '/dashboard' })}
              className="bg-primary text-on-primary font-bold rounded-md px-4 py-2 text-xs hover:bg-primary-container transition-colors"
            >
              Get Started
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden cf-grid-bg">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] cf-glow-primary pointer-events-none" />
        <div className="relative max-w-5xl mx-auto px-margin py-20 text-center">
          <div className="inline-flex items-center gap-2 chip chip-primary mb-md">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot" />
            Now supporting GitHub Actions
          </div>
          <h1 className="font-display text-[64px] md:text-[80px] leading-[0.95] tracking-[-0.04em] font-bold text-on-surface text-balance">
            Turn GitHub commits into content{' '}
            <span className="text-primary italic">people actually read.</span>
          </h1>
          <p className="mt-lg text-on-surface-variant max-w-2xl mx-auto leading-relaxed">
            CommitFlex analyzes your shipped work and generates authentic LinkedIn posts and Twitter
            threads automatically. Keep your community updated without leaving the terminal.
          </p>
          <div className="mt-xl flex items-center justify-center gap-md flex-wrap">
            <button
              onClick={() => signIn('github', { callbackUrl: '/dashboard' })}
              className="btn-primary-solid h-12 px-6 rounded-xl text-sm flex items-center gap-2"
            >
              <GitHubIcon />
              Connect GitHub
            </button>
            <a
              href="#how"
              className="btn-ghost h-12 px-6 rounded-xl text-sm flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"/>
              </svg>
              See Demo
            </a>
          </div>

          {/* Terminal mock */}
          <div className="mt-xl grid grid-cols-12 gap-md max-w-4xl mx-auto text-left">
            <div className="col-span-12 md:col-span-8 glass-card rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-md py-sm border-b border-white/8">
                <div className="flex gap-1.5">
                  {['#ffb4ab', '#ffb869', '#86efac'].map(c => (
                    <div key={c} className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
                  ))}
                </div>
                <span className="font-mono text-code-sm ml-2 text-on-surface-variant">
                  nextjs-dashboard / main
                </span>
              </div>
              <div className="p-md font-mono text-code-sm space-y-1">
                <p className="text-on-surface-variant">commit <span className="text-tertiary">f2a49b2</span></p>
                <p className="text-on-surface">
                  <span className="text-primary">feat:</span> implement server-side streaming for dashboard metrics
                </p>
                <p className="text-on-surface-variant mt-2 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot" />
                  Analyzing logic...
                </p>
              </div>
            </div>
            <div className="col-span-12 md:col-span-4 space-y-md">
              <div className="glass-card rounded-md p-md">
                <p className="font-mono text-label-caps uppercase tracking-widest text-primary mb-1">Twitter Thread</p>
                <p className="text-code-sm text-on-surface leading-relaxed">
                  Just shipped server-side streaming on our dashboard. No more spinners…
                </p>
              </div>
              <div className="glass-card rounded-md p-md">
                <p className="font-mono text-label-caps uppercase tracking-widest text-secondary mb-1">LinkedIn Post</p>
                <p className="text-code-sm text-on-surface leading-relaxed">
                  Technical depth update: We&apos;ve optimized data fetching patterns by implementing…
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pipeline */}
      <section id="how" className="border-t border-white/8 py-20">
        <div className="max-w-6xl mx-auto px-margin">
          <h2 className="font-display text-headline-md font-bold text-on-surface text-center">
            Automated Pipeline
          </h2>
          <p className="text-on-surface-variant text-center mt-2">
            From code to community in four precise steps.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-md mt-xl">
            {PIPELINE.map(s => (
              <div key={s.n} className="glass-card glass-card-hover rounded-xl p-lg flex flex-col gap-sm">
                <p className="font-mono text-code-sm text-primary">
                  {s.n} <span className="text-on-surface-variant">{'//'} {s.tag}</span>
                </p>
                <h3 className="font-display text-base font-bold text-on-surface mt-2">{s.title}</h3>
                <p className="text-code-sm text-on-surface-variant leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="border-t border-white/8 py-20">
        <div className="max-w-6xl mx-auto px-margin">
          <h2 className="font-display text-headline-md font-bold text-on-surface">
            Approved by the <span className="italic text-primary">elite.</span>
          </h2>
          <p className="text-on-surface-variant mt-2">
            Join 500+ engineers at Vercel, Stripe, and Railway who automate their social presence.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-md mt-xl">
            {TESTIMONIALS.map(t => (
              <div key={t.name} className="glass-card rounded-xl p-lg">
                <p className="text-on-surface leading-relaxed italic">&ldquo;{t.quote}&rdquo;</p>
                <p className="font-mono text-code-sm text-primary mt-md">{t.name}</p>
                <p className="font-mono text-code-sm text-on-surface-variant">{t.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/8 mt-auto py-md">
        <div className="max-w-7xl mx-auto px-margin flex flex-col md:flex-row items-center justify-between gap-md">
          <div className="flex items-center gap-md">
            <span className="font-display text-base font-bold tracking-tighter text-on-surface">
              Commit<span className="text-primary">Flex</span>
            </span>
            <span className="font-mono text-code-sm text-on-surface-variant">
              © 2026 CommitFlex AI. Built for the elite.
            </span>
          </div>
          <div className="flex gap-lg">
            {['Privacy', 'Terms', 'Security', 'Status'].map(s => (
              <a key={s} href="#" className="font-mono text-code-sm text-on-surface-variant hover:text-primary transition-colors">
                {s}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
