'use client'

import { useState } from 'react'

interface VoiceSettingsFormProps {
  initialTone: string
  initialTechnicalLevel: number
  initialAudience: string
  initialExtraContext: string
}

const TONE_OPTIONS = ['professional', 'casual', 'enthusiastic', 'analytical', 'storytelling']
const AUDIENCE_OPTIONS = ['developers', 'engineering leaders', 'product managers', 'general tech', 'non-technical']

const MIN_SAMPLE_LEN = 50
const MIN_SAMPLES = 3
const MAX_SAMPLES = 10

export function VoiceSettingsForm({
  initialTone,
  initialTechnicalLevel,
  initialAudience,
  initialExtraContext,
}: VoiceSettingsFormProps) {
  const [tone, setTone] = useState(initialTone)
  const [technicalLevel, setTechnicalLevel] = useState(initialTechnicalLevel)
  const [audience, setAudience] = useState(initialAudience)
  const [extraContext, setExtraContext] = useState(initialExtraContext)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Voice-training state
  const [trainOpen, setTrainOpen] = useState(false)
  const [samples, setSamples] = useState<string[]>(['', '', ''])
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [fingerprint, setFingerprint] = useState<string | null>(null)

  const validSamples = samples
    .map(s => s.trim())
    .filter(s => s.length >= MIN_SAMPLE_LEN)
  const canAnalyze = validSamples.length >= MIN_SAMPLES && !analyzing

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/voice', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tone, technicalLevel, audience, extraContext }),
      })
      if (!res.ok) throw new Error('Failed to save')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      setError('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleAnalyze = async () => {
    setAnalyzing(true)
    setAnalyzeError(null)
    setFingerprint(null)
    try {
      const res = await fetch('/api/voice/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ samples: validSamples }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const msg =
          typeof data.error === 'string'
            ? data.error
            : data.error?.fieldErrors?.samples?.[0] ?? 'Analysis failed'
        throw new Error(msg)
      }
      const data = await res.json()
      setFingerprint(data.fingerprint ?? null)
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setAnalyzing(false)
    }
  }

  const handleUseFingerprint = () => {
    if (!fingerprint) return
    // Append the fingerprint to existing context if there's already content the
    // user typed by hand — otherwise replace.
    const trimmed = extraContext.trim()
    if (!trimmed) {
      setExtraContext(fingerprint)
    } else if (!trimmed.toLowerCase().includes('voice fingerprint:')) {
      setExtraContext(`${trimmed}\n\n${fingerprint}`)
    } else {
      // Replace any existing fingerprint paragraph with the new one.
      setExtraContext(
        trimmed.replace(/Voice fingerprint:[^\n]*(?:\n[^\n]+)*/i, fingerprint),
      )
    }
  }

  const setSampleAt = (i: number, value: string) =>
    setSamples(prev => prev.map((s, j) => (i === j ? value : s)))

  const addSample = () => setSamples(prev => prev.length < MAX_SAMPLES ? [...prev, ''] : prev)
  const removeSample = (i: number) =>
    setSamples(prev => (prev.length > MIN_SAMPLES ? prev.filter((_, j) => j !== i) : prev))

  const labelClass = 'font-mono text-label-caps uppercase tracking-widest text-on-surface-variant'

  const chipBtn = (active: boolean) =>
    `px-3 py-1.5 rounded-md font-mono text-code-sm capitalize transition-colors border ${
      active
        ? 'bg-primary/10 text-primary border-primary/40'
        : 'bg-transparent text-on-surface-variant border-white/8 hover:border-white/20 hover:text-on-surface'
    }`

  return (
    <div className="space-y-lg">
      {/* Tone */}
      <div className="space-y-sm">
        <label className={labelClass}>Tone</label>
        <div className="flex flex-wrap gap-2">
          {TONE_OPTIONS.map(t => (
            <button key={t} onClick={() => setTone(t)} className={chipBtn(tone === t)}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Technical level */}
      <div className="space-y-sm">
        <label className={labelClass}>
          Technical level <span className="text-primary">{technicalLevel}/10</span>
        </label>
        <input
          type="range"
          min={1}
          max={10}
          value={technicalLevel}
          onChange={e => setTechnicalLevel(Number(e.target.value))}
          className="w-full accent-primary"
        />
        <div className="flex justify-between font-mono text-code-sm text-outline-variant">
          <span>Business-focused</span>
          <span>Highly technical</span>
        </div>
      </div>

      {/* Audience */}
      <div className="space-y-sm">
        <label className={labelClass}>Primary audience</label>
        <div className="flex flex-wrap gap-2">
          {AUDIENCE_OPTIONS.map(a => (
            <button key={a} onClick={() => setAudience(a)} className={chipBtn(audience === a)}>
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* Train from samples */}
      <div className="rounded-xl border border-white/8">
        <button
          type="button"
          onClick={() => setTrainOpen(o => !o)}
          aria-expanded={trainOpen}
          className="w-full flex items-center justify-between px-md py-sm text-left"
        >
          <span className="flex items-center gap-2">
            <span className="font-mono text-label-caps uppercase tracking-widest text-primary">
              Train from samples
            </span>
            <span className="font-mono text-code-sm text-on-surface-variant">
              paste {MIN_SAMPLES}+ of your past posts → we extract your voice
            </span>
          </span>
          <span className="text-outline-variant">{trainOpen ? '−' : '+'}</span>
        </button>

        {trainOpen && (
          <div className="px-md pb-md space-y-md border-t border-white/8">
            <div className="pt-md space-y-2">
              {samples.map((s, i) => {
                const trimmed = s.trim()
                const isShort = trimmed.length > 0 && trimmed.length < MIN_SAMPLE_LEN
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-code-sm text-on-surface-variant">
                        Sample {i + 1}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`font-mono text-code-sm tabular-nums ${
                          isShort ? 'text-error' : trimmed.length >= MIN_SAMPLE_LEN ? 'text-tertiary' : 'text-outline-variant'
                        }`}>
                          {trimmed.length} / {MIN_SAMPLE_LEN}+ chars
                        </span>
                        {samples.length > MIN_SAMPLES && (
                          <button
                            type="button"
                            onClick={() => removeSample(i)}
                            className="font-mono text-code-sm uppercase tracking-widest text-on-surface-variant hover:text-error"
                            aria-label={`Remove sample ${i + 1}`}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                    <textarea
                      value={s}
                      onChange={e => setSampleAt(i, e.target.value)}
                      rows={4}
                      maxLength={5000}
                      placeholder="Paste one of your real LinkedIn posts or tweets here…"
                      className="w-full rounded-lg bg-surface-container-low border border-white/8 px-3 py-2 text-sm text-on-surface placeholder:text-outline-variant focus:outline-none focus:border-primary/50 transition-colors resize-none font-mono"
                    />
                  </div>
                )
              })}
            </div>

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={addSample}
                disabled={samples.length >= MAX_SAMPLES}
                className="btn-ghost h-9 px-3 rounded-md font-mono text-label-caps uppercase disabled:opacity-40"
              >
                + Add sample
              </button>
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={!canAnalyze}
                className="btn-primary-solid h-9 px-4 rounded-md font-mono text-label-caps uppercase disabled:opacity-40"
              >
                {analyzing ? 'Analyzing…' : `Analyze (${validSamples.length}/${MIN_SAMPLES})`}
              </button>
            </div>

            {analyzeError && (
              <p className="font-mono text-code-sm text-error">{analyzeError}</p>
            )}

            {fingerprint && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-md space-y-sm">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-label-caps uppercase tracking-widest text-primary">
                    Detected fingerprint
                  </span>
                  <button
                    type="button"
                    onClick={handleUseFingerprint}
                    className="font-mono text-label-caps uppercase tracking-widest text-primary hover:text-on-surface transition-colors"
                  >
                    Use this →
                  </button>
                </div>
                <p className="text-sm text-on-surface leading-relaxed">{fingerprint}</p>
                <p className="font-mono text-code-sm text-outline-variant">
                  Click <span className="text-primary">Use this</span> to copy it into Extra context, then Save.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Extra context */}
      <div className="space-y-sm">
        <label className={labelClass}>Extra context (optional)</label>
        <textarea
          value={extraContext}
          onChange={e => setExtraContext(e.target.value)}
          placeholder="e.g. I'm building a SaaS product, I like to focus on user impact..."
          rows={4}
          maxLength={2000}
          className="w-full rounded-lg bg-transparent border border-white/8 px-3 py-2.5 text-sm text-on-surface placeholder:text-outline-variant focus:outline-none focus:border-primary/50 transition-colors resize-none"
        />
        <div className="flex justify-end font-mono text-code-sm text-outline-variant">
          {extraContext.length} / 2000
        </div>
      </div>

      {error && <p className="font-mono text-code-sm text-error">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="btn-primary-solid w-full h-11 rounded-xl text-sm disabled:opacity-50"
      >
        {saved ? 'Saved!' : saving ? 'Saving...' : 'Save voice settings'}
      </button>
    </div>
  )
}
