'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Profile {
  id: string
  name: string
  isDefault: boolean
  tone: string
  technicalLevel: number
  audience: string
  extraContext: string | null
}

interface Props {
  initialProfiles: Profile[]
}

const TONE_OPTIONS = ['professional', 'casual', 'enthusiastic', 'analytical', 'storytelling']
const AUDIENCE_OPTIONS = ['developers', 'engineering leaders', 'product managers', 'general tech', 'non-technical']

export function VoiceProfileManager({ initialProfiles }: Props) {
  const router = useRouter()
  const [profiles, setProfiles] = useState<Profile[]>(initialProfiles)
  const [selectedId, setSelectedId] = useState<string>(() => {
    return initialProfiles.find(p => p.isDefault)?.id ?? initialProfiles[0]?.id ?? ''
  })
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selected = useMemo(
    () => profiles.find(p => p.id === selectedId) ?? null,
    [profiles, selectedId],
  )

  // ── Profile editing (local state mirror of `selected`) ───────────────
  const [name, setName] = useState(selected?.name ?? 'Default')
  const [tone, setTone] = useState(selected?.tone ?? 'professional')
  const [technicalLevel, setTechnicalLevel] = useState(selected?.technicalLevel ?? 7)
  const [audience, setAudience] = useState(selected?.audience ?? 'developers')
  const [extraContext, setExtraContext] = useState(selected?.extraContext ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // When the selection changes, hydrate the form with the new profile.
  useEffect(() => {
    if (!selected) return
    setName(selected.name)
    setTone(selected.tone)
    setTechnicalLevel(selected.technicalLevel)
    setAudience(selected.audience)
    setExtraContext(selected.extraContext ?? '')
    setSaved(false)
    setError(null)
  }, [selected])

  const handleAddProfile = async () => {
    setAdding(true)
    setError(null)
    try {
      const suggested = `Profile ${profiles.length + 1}`
      const res = await fetch('/api/voice/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: suggested,
          tone: 'professional',
          technicalLevel: 7,
          audience: 'developers',
          extraContext: '',
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to create profile')
      }
      const { profile } = await res.json()
      setProfiles(prev => [...prev, normaliseProfile(profile)])
      setSelectedId(profile.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create profile')
    } finally {
      setAdding(false)
    }
  }

  const handleMakeDefault = async (id: string) => {
    setError(null)
    try {
      const res = await fetch(`/api/voice/profiles/${id}/default`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set default')
      // Reflect locally.
      setProfiles(prev => prev.map(p => ({ ...p, isDefault: p.id === id })))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set default')
    }
  }

  const handleDelete = async (id: string) => {
    setError(null)
    try {
      const res = await fetch(`/api/voice/profiles/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to delete profile')
      }
      const remaining = profiles.filter(p => p.id !== id)
      // If the deleted profile was the default, the server promotes another —
      // we mirror that locally.
      const wasDefault = profiles.find(p => p.id === id)?.isDefault
      if (wasDefault && remaining[0]) remaining[0].isDefault = true
      setProfiles(remaining)
      if (selectedId === id) {
        setSelectedId(remaining[0]?.id ?? '')
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete profile')
    }
  }

  const handleSave = async () => {
    if (!selected) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/voice/profiles/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, tone, technicalLevel, audience, extraContext }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to save')
      }
      const { profile } = await res.json()
      setProfiles(prev => prev.map(p => p.id === profile.id ? normaliseProfile(profile) : p))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
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
      {/* Profile picker */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className={labelClass}>Profiles</p>
          <button
            type="button"
            onClick={handleAddProfile}
            disabled={adding}
            className="font-mono text-code-sm uppercase tracking-widest text-primary hover:text-on-surface disabled:opacity-50"
          >
            {adding ? 'Adding…' : '+ Add profile'}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {profiles.map(p => {
            const active = p.id === selectedId
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={`px-3 py-2 rounded-md font-mono text-code-sm transition-colors border flex items-center gap-2 ${
                  active
                    ? 'bg-primary/10 text-primary border-primary/40'
                    : 'bg-transparent text-on-surface-variant border-white/8 hover:border-white/20 hover:text-on-surface'
                }`}
              >
                <span>{p.name}</span>
                {p.isDefault && (
                  <span className="chip chip-success normal-case">default</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {selected && (
        <>
          {/* Per-profile actions */}
          <div className="flex flex-wrap items-center gap-2 pt-md border-t border-white/8">
            {!selected.isDefault && (
              <button
                type="button"
                onClick={() => handleMakeDefault(selected.id)}
                className="btn-ghost h-8 px-3 rounded-md font-mono text-label-caps uppercase"
              >
                Set as default
              </button>
            )}
            <button
              type="button"
              onClick={() => handleDelete(selected.id)}
              disabled={profiles.length <= 1}
              className="btn-ghost h-8 px-3 rounded-md font-mono text-label-caps uppercase text-error border-error/30 hover:bg-error/10 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Delete profile
            </button>
            {profiles.length <= 1 && (
              <span className="font-mono text-code-sm text-outline-variant">
                Can&apos;t delete your only profile.
              </span>
            )}
          </div>

          {/* Profile editor */}
          <div className="space-y-lg pt-md">
            {/* Name */}
            <div className="space-y-sm">
              <label className={labelClass}>Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={60}
                className="w-full rounded-lg bg-transparent border border-white/8 px-3 py-2.5 text-sm font-mono text-on-surface focus:outline-none focus:border-primary/50 transition-colors"
                placeholder="e.g. Founder voice, Tech writeups, Sarcastic"
              />
            </div>

            {/* Tone */}
            <div className="space-y-sm">
              <label className={labelClass}>Tone</label>
              <div className="flex flex-wrap gap-2">
                {TONE_OPTIONS.map(t => (
                  <button
                    type="button"
                    key={t}
                    onClick={() => setTone(t)}
                    className={chipBtn(tone === t)}
                  >
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
                  <button
                    type="button"
                    key={a}
                    onClick={() => setAudience(a)}
                    className={chipBtn(audience === a)}
                  >
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
              {saved ? 'Saved!' : saving ? 'Saving...' : `Save profile`}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function normaliseProfile(p: {
  id: string
  name: string
  isDefault: boolean
  tone: string
  technicalLevel: number
  audience: string
  extraContext: string | null
}): Profile {
  return {
    id: p.id,
    name: p.name,
    isDefault: p.isDefault,
    tone: p.tone,
    technicalLevel: p.technicalLevel,
    audience: p.audience,
    extraContext: p.extraContext ?? '',
  }
}
