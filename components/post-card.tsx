'use client'

import { useEffect, useState } from 'react'

export interface PostCardVariant {
  id: string
  content: string
  hashtags: string[]
  status: string
  sequenceNumber: number
}

interface PostCardProps {
  /** Single-variant compat fields (existing callers + tests). */
  draftId?: string
  content?: string
  hashtags?: string[]
  status?: string
  /** When set, takes precedence over the single fields above. */
  variants?: PostCardVariant[]
  platform: 'linkedin' | 'twitter'
  onCopied?: () => void
  onVariantsCreated?: () => void
}

const PLATFORM_CONFIG = {
  linkedin: { label: 'LinkedIn Post', limit: 3000, color: '#adc6ff', chip: 'chip-secondary' },
  twitter:  { label: 'Twitter / X',   limit: 280,  color: '#d0bcff', chip: 'chip-primary' },
}

const LinkedInIcon = () => (
  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
)
const XIcon = () => (
  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.732-8.858L1.255 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
)
const CopyIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" /></svg>
)
const RefreshIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
)
const CheckIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
)
const SparkIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
)

function Slider({ label, value, onChange, disabled }: { label: string; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-sm">
      <span className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant w-20 shrink-0">
        {label}
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        disabled={disabled}
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1 accent-primary disabled:opacity-40"
        aria-label={label}
      />
      <span className="font-mono text-code-sm tabular-nums text-on-surface w-8 text-right">{value}</span>
    </div>
  )
}

export function PostCard(props: PostCardProps) {
  const { platform, onCopied, onVariantsCreated } = props
  const cfg = PLATFORM_CONFIG[platform]

  // Build a normalised variant list. If only the single-draft props are supplied
  // (legacy callers + existing tests), wrap them in a one-element list.
  const initialVariants: PostCardVariant[] =
    props.variants && props.variants.length > 0
      ? props.variants
      : [{
          id: props.draftId ?? '',
          content: props.content ?? '',
          hashtags: props.hashtags ?? [],
          status: props.status ?? 'generated',
          sequenceNumber: 1,
        }]

  const [variants, setVariants] = useState<PostCardVariant[]>(initialVariants)
  const [activeIdx, setActiveIdx] = useState(0)

  // Keep local state in sync if parent passes a fresh variant list (e.g. after refresh).
  useEffect(() => {
    if (props.variants && props.variants.length > 0) {
      setVariants(props.variants)
      setActiveIdx(i => Math.min(i, props.variants!.length - 1))
    }
  }, [props.variants])

  const active = variants[activeIdx]
  const [content, setContent] = useState(active.content)
  const [saving, setSaving] = useState(false)
  const [copying, setCopying] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [variantsLoading, setVariantsLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(active.status === 'copied')
  const [error, setError] = useState<string | null>(null)

  // Tone sliders
  const [tuneOpen, setTuneOpen] = useState(false)
  const [technical, setTechnical] = useState(50)
  const [engagement, setEngagement] = useState(50)
  const [creativity, setCreativity] = useState(50)

  // When user switches tab, load that variant's content + status into editor state.
  useEffect(() => {
    setContent(active.content)
    setCopied(active.status === 'copied')
    setSaved(false)
    setError(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.id])

  const overLimit = content.length > cfg.limit
  const pct = Math.min(content.length / cfg.limit, 1)
  const fullText = active.hashtags.length > 0 ? `${content}\n\n${active.hashtags.join(' ')}` : content

  const handleSave = async () => {
    if (!active.id) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/drafts/${active.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) throw new Error('Failed to save')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      setError('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleCopy = async () => {
    setCopying(true)
    try {
      await navigator.clipboard.writeText(fullText)
      if (active.id) await fetch(`/api/drafts/${active.id}`, { method: 'POST' })
      setCopied(true)
      onCopied?.()
    } catch {
      setError('Failed to copy')
    } finally {
      setCopying(false)
    }
  }

  const handleRegenerate = async () => {
    if (!active.id) return
    setRegenerating(true)
    setError(null)
    try {
      const res = await fetch(`/api/drafts/${active.id}/replace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, content }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.draft?.originalContent) setContent(data.draft.originalContent)
      }
    } catch {
      setError('Regeneration failed')
    } finally {
      setRegenerating(false)
    }
  }

  const handleGenerateVariants = async () => {
    if (!active.id) return
    setVariantsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/drafts/${active.id}/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ technical, engagement, creativity, count: 3 }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error?.formErrors?.[0] ?? data.error ?? 'Failed to generate variants')
      }
      onVariantsCreated?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Variant generation failed')
    } finally {
      setVariantsLoading(false)
    }
  }

  return (
    <div
      className={`glass-card rounded-xl flex flex-col overflow-hidden h-full ${regenerating || variantsLoading ? 'ai-focus' : ''}`}
      style={{ borderLeft: `2px solid ${cfg.color}` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span style={{ color: cfg.color }}>
            {platform === 'linkedin' ? <LinkedInIcon /> : <XIcon />}
          </span>
          <span className={`chip ${cfg.chip}`}>{cfg.label}</span>
          {copied && (
            <span className="flex items-center gap-1 chip chip-tertiary normal-case">
              <CheckIcon /> Copied
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-1 rounded-full overflow-hidden bg-white/8" style={{ width: '36px' }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${pct * 100}%`, background: overLimit ? '#ffb4ab' : cfg.color }}
            />
          </div>
          <span
            className="font-mono text-code-sm tabular-nums"
            style={{ color: overLimit ? '#ffb4ab' : '#cbc3d7' }}
          >
            {content.length}<span className="text-outline-variant">/{cfg.limit}</span>
          </span>
        </div>
      </div>

      {/* Variant tabs */}
      {variants.length > 1 && (
        <div className="flex items-center gap-1 px-4 pt-3 -mb-1 border-b border-white/5">
          {variants.map((v, i) => {
            const isActive = i === activeIdx
            return (
              <button
                key={v.id}
                onClick={() => setActiveIdx(i)}
                className={`px-3 py-1.5 rounded-t-md font-mono text-code-sm uppercase tracking-widest border-b-2 transition-colors ${
                  isActive
                    ? 'border-primary text-primary bg-primary/5'
                    : 'border-transparent text-on-surface-variant hover:text-on-surface'
                }`}
              >
                v{v.sequenceNumber}
              </button>
            )
          })}
          <span className="ml-auto font-mono text-code-sm text-outline-variant">
            {activeIdx + 1} / {variants.length}
          </span>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex flex-col p-4 gap-3">
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          className="flex-1 w-full min-h-[200px] resize-none text-sm leading-relaxed focus:outline-none bg-transparent text-on-surface placeholder:text-outline-variant"
          placeholder={`Write your ${cfg.label} post here...`}
        />

        {active.hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-white/5">
            {active.hashtags.map(tag => (
              <span key={tag} className="font-mono text-code-sm" style={{ color: cfg.color, opacity: 0.7 }}>
                {tag}
              </span>
            ))}
          </div>
        )}

        {error && (
          <p className="font-mono text-code-sm text-error">{error}</p>
        )}
      </div>

      {/* Tone tune panel */}
      <div className="border-t border-white/8">
        <button
          type="button"
          onClick={() => setTuneOpen(o => !o)}
          aria-expanded={tuneOpen}
          className="w-full flex items-center justify-between px-4 py-2.5 font-mono text-code-sm uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <span className="flex items-center gap-2">
            <SparkIcon />
            Tune voice
          </span>
          <span className="text-outline-variant">{tuneOpen ? '−' : '+'}</span>
        </button>
        {tuneOpen && (
          <div className="px-4 pb-4 space-y-2.5 border-t border-white/5">
            <div className="pt-3">
              <Slider label="Technical"  value={technical}  onChange={setTechnical}  disabled={variantsLoading} />
            </div>
            <Slider label="Engagement" value={engagement} onChange={setEngagement} disabled={variantsLoading} />
            <Slider label="Creativity" value={creativity} onChange={setCreativity} disabled={variantsLoading} />
            <button
              onClick={handleGenerateVariants}
              disabled={variantsLoading || !active.id}
              className="btn-primary-solid w-full h-9 rounded-lg font-mono text-label-caps uppercase flex items-center justify-center gap-1.5 disabled:opacity-40"
            >
              <SparkIcon />
              {variantsLoading ? 'Generating 3 variants…' : 'Generate 3 variants'}
            </button>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-white/8 bg-black/20">
        <button
          onClick={handleSave}
          disabled={saving || overLimit || !active.id}
          className="btn-ghost flex-1 h-9 rounded-lg font-mono text-label-caps uppercase flex items-center justify-center gap-1.5 disabled:opacity-40"
          style={saved ? { background: 'rgba(255,184,105,0.10)', color: '#ffb869', borderColor: 'rgba(255,184,105,0.3)' } : undefined}
        >
          {saved ? <><CheckIcon /> Saved</> : saving ? 'Saving...' : 'Save'}
        </button>

        <button
          onClick={handleRegenerate}
          disabled={regenerating || !active.id}
          className="btn-ghost h-9 w-9 rounded-lg flex items-center justify-center disabled:opacity-40"
          title="Regenerate"
        >
          <span className={regenerating ? 'animate-spin' : ''}>
            <RefreshIcon />
          </span>
        </button>

        <button
          onClick={handleCopy}
          disabled={copying || overLimit}
          className="btn-primary-solid flex-1 h-9 rounded-lg font-mono text-label-caps uppercase flex items-center justify-center gap-1.5 disabled:opacity-40"
        >
          {copying ? 'Copying...' : <><CopyIcon /> Copy post</>}
        </button>
      </div>
    </div>
  )
}
