'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import Link from 'next/link'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import type { Variants } from 'motion/react'

/* ─── Icons ─────────────────────────────────────────────────────────────── */

function GitHubIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}

const FEATURE_ICONS = {
  spark: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18 7.5l.39-1.37a3 3 0 00-2.13-2.13L15 3.75l1.26-.25a3 3 0 002.13-2.13L18.75 0l.39 1.37a3 3 0 002.13 2.13L22.5 3.75l-1.37.39a3 3 0 00-2.13 2.13L18.75 7.5z"/>
    </svg>
  ),
  wave: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"/>
    </svg>
  ),
  webhook: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"/>
    </svg>
  ),
  layers: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0l4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0l-5.571 3-5.571-3"/>
    </svg>
  ),
  shield: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z"/>
    </svg>
  ),
  bell: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"/>
    </svg>
  ),
}

/* ─── Data ──────────────────────────────────────────────────────────────── */

const PIPELINE = [
  { n: '01', tag: 'SOURCE',  title: 'Sync Repo',     body: 'Connect any public or private GitHub repository via OAuth in seconds.' },
  { n: '02', tag: 'ANALYZE', title: 'Semantic Pull', body: 'An LLM parses your diffs and PR descriptions to understand the “why” behind the code.' },
  { n: '03', tag: 'REFINE',  title: 'Persona Match', body: 'Tone sliders adapt the voice to your developer persona — academic, casual, or punchy.' },
  { n: '04', tag: 'SHIP',    title: 'Auto-Draft',    body: 'Pre-written LinkedIn and Twitter drafts land in your dashboard, ready to publish.' },
]

const FEATURES = [
  {
    icon: FEATURE_ICONS.spark,
    title: 'Voice that’s actually yours',
    body: 'Paste 3–5 of your past posts and CommitFlex extracts your voice fingerprint — sentence rhythm, recurring phrases, sign-off style. Every future draft sounds like you wrote it.',
  },
  {
    icon: FEATURE_ICONS.wave,
    title: 'Three variants, on demand',
    body: 'Don’t like the first take? Tone sliders for technical / engagement / creativity, plus a one-click button for three alternative versions to pick from.',
  },
  {
    icon: FEATURE_ICONS.webhook,
    title: 'Auto-generate on every push',
    body: 'Install the GitHub webhook once. From then on, every push to your default branch triggers a fresh generation. You wake up to drafts.',
  },
  {
    icon: FEATURE_ICONS.layers,
    title: 'LinkedIn + Twitter, one source',
    body: 'A single narrative split across two platforms with the right format for each — long-form thoughtful for LinkedIn, punchy thread for X.',
  },
  {
    icon: FEATURE_ICONS.shield,
    title: 'Read-only access, your data stays yours',
    body: 'CommitFlex only reads commit messages and PR descriptions. We never write to your repos, never send code to third parties.',
  },
  {
    icon: FEATURE_ICONS.bell,
    title: 'Pinged when ready',
    body: 'Email arrives the moment drafts are done. Opt out anytime from settings. Weekly digest if that’s more your speed.',
  },
]

const FAQ = [
  {
    q: 'Will CommitFlex post automatically to my socials?',
    a: 'No. It generates drafts and notifies you. You review, tweak, and click Copy — you stay in control of what hits your feed.',
  },
  {
    q: 'What can it see in my private repos?',
    a: 'Only what the OAuth scope grants: commit messages, PR titles and descriptions, and basic file change summaries. The full source tree is never sent to an LLM.',
  },
  {
    q: 'Which AI model powers the drafts?',
    a: 'Google Gemini 2.5 Flash, with retries and a circuit breaker so transient failures don’t corrupt your generation history. Model choice is configurable per workspace.',
  },
  {
    q: 'How does the webhook automation work?',
    a: 'On repo connect we install a push webhook with a per-repo HMAC secret. Pushes to your default branch trigger a generation for the last seven days of commits. You can flip the auto-generate switch off per repo at any time.',
  },
  {
    q: 'What does it cost?',
    a: 'Free during beta. No card needed to start. We’ll give you plenty of warning before any pricing rolls out.',
  },
  {
    q: 'Can I export my drafts?',
    a: 'Yes — every draft has copy-to-clipboard with full hashtags. JSON export and a public REST API are on the roadmap.',
  },
]

/* ─── Motion helpers ────────────────────────────────────────────────────── */

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
}

const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
}

const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
}

/* ─── Component ─────────────────────────────────────────────────────────── */

export function LandingContent() {
  const reduce = useReducedMotion()
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  // Preview tab state — drives the animated mock in the live-preview section.
  const [previewTab, setPreviewTab] = useState<'twitter' | 'linkedin'>('twitter')

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ─── Top nav ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-white/8 backdrop-blur-md bg-background/80">
        <div className="max-w-7xl mx-auto px-margin py-md flex items-center justify-between">
          <Link href="/" className="font-display text-base font-bold tracking-tighter text-on-surface">
            Commit<span className="text-primary">Flex</span>
          </Link>
          <nav className="hidden md:flex items-center gap-lg font-mono text-code-sm text-on-surface-variant">
            <a href="#features" className="hover:text-on-surface transition-colors">Features</a>
            <a href="#how" className="hover:text-on-surface transition-colors">How it works</a>
            <a href="#faq" className="hover:text-on-surface transition-colors">FAQ</a>
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
              className="btn-primary-violet rounded-md px-4 py-2 text-xs"
            >
              Get Started
            </button>
          </div>
        </div>
      </header>

      {/* ─── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden cf-grid-bg cf-beam">
        <div className="absolute inset-0 cf-aurora pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1100px] h-[600px] cf-glow-primary pointer-events-none" />
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, transparent 40%, #0A0A0A 90%)' }} />

        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
          className="relative max-w-5xl mx-auto px-margin py-20 text-center"
        >
          <motion.h1
            variants={fadeUp}
            className="font-display text-[64px] md:text-[80px] leading-[0.95] tracking-[-0.04em] font-bold text-on-surface text-balance"
          >
            Turn GitHub commits into content{' '}
            <span className="text-primary italic">people actually read.</span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="mt-lg text-on-surface-variant max-w-2xl mx-auto leading-relaxed"
          >
            CommitFlex reads your shipped work and drafts authentic LinkedIn posts and Twitter threads
            in your voice. Stop wrestling with the &quot;just shipped&quot; post — write once with
            samples, then auto-generate on every push.
          </motion.p>

          <motion.div
            variants={fadeUp}
            className="mt-xl flex items-center justify-center gap-md flex-wrap"
          >
            <button
              onClick={() => signIn('github', { callbackUrl: '/dashboard' })}
              className="btn-primary-solid h-12 px-6 rounded-xl text-sm flex items-center gap-2"
            >
              <GitHubIcon />
              Connect GitHub
            </button>
            <a href="#preview" className="btn-ghost h-12 px-6 rounded-xl text-sm flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"/>
              </svg>
              See it in action
            </a>
          </motion.div>

          {/* Terminal mock */}
          <motion.div
            variants={fadeUp}
            className="mt-xl grid grid-cols-12 gap-md max-w-4xl mx-auto text-left"
          >
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
              <motion.div
                whileHover={reduce ? undefined : { y: -2 }}
                className="glass-card rounded-md p-md"
              >
                <p className="font-mono text-label-caps uppercase tracking-widest text-primary mb-1">Twitter Thread</p>
                <p className="text-code-sm text-on-surface leading-relaxed">
                  Just shipped server-side streaming on our dashboard. No more spinners…
                </p>
              </motion.div>
              <motion.div
                whileHover={reduce ? undefined : { y: -2 }}
                className="glass-card rounded-md p-md"
              >
                <p className="font-mono text-label-caps uppercase tracking-widest text-secondary mb-1">LinkedIn Post</p>
                <p className="text-code-sm text-on-surface leading-relaxed">
                  Technical depth update: We&apos;ve optimized data fetching patterns by implementing…
                </p>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* ─── Trust band ───────────────────────────────────────────────── */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        variants={fadeUp}
        className="border-t border-white/8 py-md"
      >
        <div className="max-w-6xl mx-auto px-margin">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-md text-center">
            {[
              { kpi: '< 60s', label: 'Time to first draft' },
              { kpi: '2', label: 'Platforms covered' },
              { kpi: '100%', label: 'Open-source-friendly' },
              { kpi: 'Read-only', label: 'GitHub access' },
            ].map(s => (
              <div key={s.label} className="py-sm">
                <p className="font-display text-headline-md font-bold tracking-tighter text-on-surface">{s.kpi}</p>
                <p className="font-mono text-code-sm text-on-surface-variant uppercase tracking-widest mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* ─── Features grid ────────────────────────────────────────────── */}
      <section id="features" className="border-t border-white/8 py-20 relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px cf-beam" />
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          variants={staggerContainer}
          className="max-w-6xl mx-auto px-margin"
        >
          <motion.div variants={fadeUp} className="text-center mb-xl">
            <p className="font-mono text-label-caps uppercase tracking-widest text-primary mb-sm">
              Why CommitFlex
            </p>
            <h2 className="font-display text-headline-md md:text-display-lg font-bold tracking-tighter text-on-surface">
              Built for shipping, not posting.
            </h2>
            <p className="text-on-surface-variant mt-sm max-w-2xl mx-auto">
              Every feature exists because we got tired of writing the same &quot;we just shipped X&quot;
              post for the hundredth time. Here&apos;s what does the heavy lifting.
            </p>
          </motion.div>

          <motion.div
            variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md"
          >
            {FEATURES.map((f) => (
              <motion.div
                key={f.title}
                variants={scaleIn}
                whileHover={reduce ? undefined : { y: -3 }}
                transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                className="glass-card glass-card-hover rounded-xl p-lg flex flex-col gap-sm group cursor-default"
              >
                <div className="w-10 h-10 rounded-md bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center text-primary mb-2 group-hover:bg-primary/15 transition-colors">
                  {f.icon}
                </div>
                <h3 className="font-display text-base font-bold text-on-surface">{f.title}</h3>
                <p className="text-code-sm text-on-surface-variant leading-relaxed">{f.body}</p>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </section>

      {/* ─── Pipeline ─────────────────────────────────────────────────── */}
      <section id="how" className="border-t border-white/8 py-20">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={staggerContainer}
          className="max-w-6xl mx-auto px-margin"
        >
          <motion.div variants={fadeUp} className="text-center mb-xl">
            <p className="font-mono text-label-caps uppercase tracking-widest text-primary mb-sm">
              How it works
            </p>
            <h2 className="font-display text-headline-md md:text-display-lg font-bold tracking-tighter text-on-surface">
              From <span className="italic">commit</span> to <span className="text-primary italic">community</span> in four steps.
            </h2>
          </motion.div>

          <div className="relative grid grid-cols-1 md:grid-cols-4 gap-md mt-xl">
            {/* Connecting line behind cards on desktop */}
            <div className="hidden md:block absolute top-12 left-[12%] right-[12%] h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
            {PIPELINE.map((s, i) => (
              <motion.div
                key={s.n}
                variants={fadeUp}
                custom={i}
                whileHover={reduce ? undefined : { y: -4 }}
                className="relative glass-card glass-card-hover rounded-xl p-lg flex flex-col gap-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="font-display text-2xl font-bold text-primary">{s.n}</span>
                  <span className="font-mono text-code-sm text-on-surface-variant uppercase tracking-widest">
                    {s.tag}
                  </span>
                </div>
                <h3 className="font-display text-base font-bold text-on-surface mt-2">{s.title}</h3>
                <p className="text-code-sm text-on-surface-variant leading-relaxed">{s.body}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ─── Live preview ─────────────────────────────────────────────── */}
      <section id="preview" className="border-t border-white/8 py-20 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] cf-glow-primary opacity-50" />
        </div>
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={staggerContainer}
          className="relative max-w-5xl mx-auto px-margin"
        >
          <motion.div variants={fadeUp} className="text-center mb-xl">
            <p className="font-mono text-label-caps uppercase tracking-widest text-primary mb-sm">
              See it in action
            </p>
            <h2 className="font-display text-headline-md md:text-display-lg font-bold tracking-tighter text-on-surface">
              One commit. Two platforms. <span className="text-primary italic">Your voice.</span>
            </h2>
          </motion.div>

          <motion.div variants={scaleIn} className="glass-card rounded-2xl overflow-hidden">
            {/* Mock editor tabs */}
            <div className="flex items-center gap-2 px-md py-sm border-b border-white/8">
              <div className="flex gap-1.5 mr-2">
                {['#ffb4ab', '#ffb869', '#86efac'].map(c => (
                  <div key={c} className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
                ))}
              </div>
              {(['twitter', 'linkedin'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setPreviewTab(t)}
                  className="relative px-3 py-1.5 font-mono text-code-sm uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  {previewTab === t && (
                    <motion.span
                      layoutId="preview-tab"
                      className="absolute inset-0 rounded-md bg-primary/10"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className={`relative ${previewTab === t ? 'text-primary' : ''}`}>
                    {t === 'twitter' ? 'Twitter / X' : 'LinkedIn'}
                  </span>
                </button>
              ))}
              <span className="ml-auto font-mono text-code-sm text-outline-variant">
                draft.preview
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
              {/* Input pane */}
              <div className="p-lg border-r border-white/8">
                <p className="font-mono text-label-caps uppercase tracking-widest text-on-surface-variant mb-2">
                  Input
                </p>
                <div className="font-mono text-code-sm space-y-1.5">
                  <p className="text-on-surface-variant">commit <span className="text-tertiary">a3f2c1d</span></p>
                  <p className="text-on-surface">
                    <span className="text-primary">feat:</span> add real-time streaming via SSE
                  </p>
                  <p className="text-on-surface-variant">commit <span className="text-tertiary">b7e8a2f</span></p>
                  <p className="text-on-surface">
                    <span className="text-primary">fix:</span> rate limiting on the commit fetcher
                  </p>
                  <p className="text-on-surface-variant">commit <span className="text-tertiary">c4d1e9a</span></p>
                  <p className="text-on-surface">
                    <span className="text-primary">refactor:</span> extract pipeline into stages
                  </p>
                </div>
              </div>

              {/* Output pane */}
              <div className="p-lg relative min-h-[260px]">
                <p className="font-mono text-label-caps uppercase tracking-widest text-on-surface-variant mb-2">
                  Draft
                </p>
                <AnimatePresence mode="wait">
                  {previewTab === 'twitter' ? (
                    <motion.div
                      key="twitter"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.25 }}
                      className="text-sm text-on-surface leading-relaxed space-y-2"
                    >
                      <p>
                        Spent the week ripping out our polling layer and shipping SSE end-to-end. Streaming
                        feels instant now — and the rate-limit fix means the pipeline doesn&apos;t fall over
                        when CI fires.
                      </p>
                      <p className="font-mono text-code-sm text-primary">#realtime #engineering</p>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="linkedin"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.25 }}
                      className="text-sm text-on-surface leading-relaxed space-y-2"
                    >
                      <p>
                        Three weeks of work, summarised in one diff: we moved from polling to server-sent
                        events for our live dashboard, hardened the commit fetcher against bursty CI, and
                        split the pipeline into discrete stages we can retry independently.
                      </p>
                      <p>
                        What I&apos;m most pleased about? You can now see every stage of a job complete in
                        real time, with no spinners pretending something&apos;s happening.
                      </p>
                      <p className="font-mono text-code-sm text-secondary">
                        #engineering #devexperience #SSE
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Footer with fake controls */}
            <div className="flex items-center gap-2 px-md py-sm border-t border-white/8">
              <span className="font-mono text-code-sm text-on-surface-variant">
                <span className="text-primary">●</span> Generated in 47s
              </span>
              <span className="ml-auto font-mono text-code-sm text-outline-variant">
                Tune voice · Variants · Copy
              </span>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* ─── FAQ ──────────────────────────────────────────────────────── */}
      <section id="faq" className="border-t border-white/8 py-20">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={staggerContainer}
          className="max-w-3xl mx-auto px-margin"
        >
          <motion.div variants={fadeUp} className="text-center mb-xl">
            <p className="font-mono text-label-caps uppercase tracking-widest text-primary mb-sm">
              FAQ
            </p>
            <h2 className="font-display text-headline-md md:text-display-lg font-bold tracking-tighter text-on-surface">
              The honest answers.
            </h2>
          </motion.div>

          <motion.div variants={staggerContainer} className="space-y-2">
            {FAQ.map((item, i) => {
              const open = openFaq === i
              return (
                <motion.div
                  key={item.q}
                  variants={fadeUp}
                  className="glass-card rounded-xl overflow-hidden"
                  layout={!reduce}
                  transition={{ layout: { duration: 0.3 } }}
                >
                  <button
                    onClick={() => setOpenFaq(open ? null : i)}
                    aria-expanded={open}
                    className="w-full flex items-center justify-between gap-md p-md text-left hover:bg-white/[0.02] transition-colors"
                  >
                    <span className="text-sm text-on-surface">{item.q}</span>
                    <motion.span
                      animate={{ rotate: open ? 45 : 0 }}
                      transition={{ duration: 0.2 }}
                      className="text-primary font-mono text-lg leading-none shrink-0"
                    >
                      +
                    </motion.span>
                  </button>
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div
                        key="body"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                        className="overflow-hidden border-t border-white/5"
                      >
                        <p className="px-md py-md text-code-sm text-on-surface-variant leading-relaxed">
                          {item.a}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )
            })}
          </motion.div>
        </motion.div>
      </section>

      {/* ─── Final CTA ────────────────────────────────────────────────── */}
      <section className="border-t border-white/8 py-20 relative overflow-hidden">
        <div className="absolute inset-0 cf-aurora pointer-events-none opacity-60" />
        <div className="absolute inset-0 cf-grid-bg pointer-events-none opacity-30" />
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, transparent 40%, #0A0A0A 85%)' }} />

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          variants={staggerContainer}
          className="relative max-w-3xl mx-auto px-margin text-center"
        >
          <motion.h2
            variants={fadeUp}
            className="font-display text-headline-md md:text-display-lg font-bold tracking-tighter text-on-surface"
          >
            Your next ship post is{' '}
            <span className="text-primary italic">already half-written.</span>
          </motion.h2>
          <motion.p
            variants={fadeUp}
            className="mt-md text-on-surface-variant max-w-xl mx-auto leading-relaxed"
          >
            Connect a repo in under a minute. We&apos;ll draft your next LinkedIn post and Twitter thread
            from the last week of commits — free during beta, no card required.
          </motion.p>
          <motion.div
            variants={fadeUp}
            className="mt-xl flex items-center justify-center gap-md flex-wrap"
          >
            <button
              onClick={() => signIn('github', { callbackUrl: '/dashboard' })}
              className="btn-primary-solid h-12 px-7 rounded-xl text-sm flex items-center gap-2"
            >
              <GitHubIcon />
              Connect GitHub
            </button>
            <a
              href="#features"
              className="font-mono text-code-sm uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-colors"
            >
              Revisit features ↑
            </a>
          </motion.div>
        </motion.div>
      </section>

      {/* ─── Footer ───────────────────────────────────────────────────── */}
      <footer className="border-t border-white/8 mt-auto py-md">
        <div className="max-w-7xl mx-auto px-margin flex flex-col md:flex-row items-center justify-between gap-md">
          <div className="flex items-center gap-md">
            <span className="font-display text-base font-bold tracking-tighter text-on-surface">
              Commit<span className="text-primary">Flex</span>
            </span>
            <span className="font-mono text-code-sm text-on-surface-variant">
              © 2026 CommitFlex. Built for devs who ship.
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
