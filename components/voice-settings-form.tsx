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

      {/* Extra context */}
      <div className="space-y-sm">
        <label className={labelClass}>Extra context (optional)</label>
        <textarea
          value={extraContext}
          onChange={e => setExtraContext(e.target.value)}
          placeholder="e.g. I'm building a SaaS product, I like to focus on user impact..."
          rows={3}
          className="w-full rounded-lg bg-transparent border border-white/8 px-3 py-2.5 text-sm text-on-surface placeholder:text-outline-variant focus:outline-none focus:border-primary/50 transition-colors resize-none"
        />
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
