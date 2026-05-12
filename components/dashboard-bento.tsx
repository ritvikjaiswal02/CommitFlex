import Link from 'next/link'

interface DraftPreview {
  id: string
  jobId: string
  platform: 'linkedin' | 'twitter'
  content: string
  toneTag?: string | null
  generatedAt: Date | string
  metric?: { label: string; value: string }
}

interface JobActivity {
  id: string
  repoName: string
  detail: string
  status: string
  at: Date | string
}

interface BentoProps {
  drafts: DraftPreview[]
  activity: JobActivity[]
  history: number[] // 7 numbers for past 7 days
}

function relTime(d: Date | string) {
  const date = d instanceof Date ? d : new Date(d)
  const s = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

const PLATFORM_META = {
  twitter: {
    label: 'TWITTER THREAD',
    chipClass: 'chip-primary',
    color: '#d0bcff',
    icon: (
      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.732-8.858L1.255 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
    ),
  },
  linkedin: {
    label: 'LINKEDIN POST',
    chipClass: 'chip-secondary',
    color: '#adc6ff',
    icon: (
      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
    ),
  },
}

function PostPreviewCard({ d }: { d: DraftPreview }) {
  const meta = PLATFORM_META[d.platform]
  return (
    <Link
      href={`/jobs/${d.jobId}`}
      className="glass-card interactive p-lg rounded-xl flex flex-col gap-md group"
    >
      <div className="flex justify-between items-start gap-2">
        <div className="flex items-center gap-xs" style={{ color: meta.color }}>
          <span>{meta.icon}</span>
          <span className="font-mono text-code-sm uppercase tracking-tighter">{meta.label}</span>
        </div>
        {d.toneTag && <span className={`chip ${meta.chipClass}`}>{d.toneTag}</span>}
      </div>

      <p className="text-on-surface leading-relaxed line-clamp-4">
        {d.platform === 'twitter' ? <span className="italic">&ldquo;{d.content}&rdquo;</span> : d.content}
      </p>

      <div className="mt-auto pt-md border-t border-white/5 flex flex-col gap-sm">
        <div className="flex justify-between items-center font-mono text-code-sm text-on-surface-variant">
          <span>Generated {relTime(d.generatedAt)}</span>
          {d.metric && <span>{d.metric.label}: {d.metric.value}</span>}
        </div>
        <div className="flex gap-sm">
          <span className="flex-1 py-xs px-md bg-surface-container hover:bg-surface-container-high rounded-lg flex items-center justify-center gap-xs font-mono text-[10px] uppercase tracking-widest text-on-surface-variant transition-colors">
            View
          </span>
        </div>
      </div>
    </Link>
  )
}

function EmptyPostsSlot() {
  return (
    <div className="glass-card rounded-xl p-lg flex flex-col items-center justify-center gap-sm text-center min-h-[220px]">
      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
        <svg className="w-5 h-5 text-primary/60" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
      </div>
      <p className="font-mono text-code-sm uppercase tracking-widest text-on-surface-variant">
        Awaiting first generation
      </p>
    </div>
  )
}

function CommitGlyph() {
  return (
    <svg className="w-5 h-5 text-on-surface-variant group-hover:text-primary transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="3" />
      <path strokeLinecap="round" d="M12 3v6m0 6v6" />
    </svg>
  )
}

const STATUS_LABEL: Record<string, string> = {
  completed: 'completed',
  partial_completed: 'partial',
  failed: 'failed',
  queued: 'queued',
  fetching_commits: 'fetching',
  summarizing: 'summarizing',
  extracting_narrative: 'building',
  generating_posts: 'writing',
  cancelled: 'cancelled',
}

export function DashboardBento({ drafts, activity, history }: BentoProps) {
  const slots = [drafts[0], drafts[1], drafts[2], drafts[3]]
  const maxHist = Math.max(1, ...history)

  return (
    <div className="grid grid-cols-12 gap-lg">
      {/* Left: 2x2 bento of post previews */}
      <section className="col-span-12 lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-lg">
        {slots.map((d, i) => d
          ? <PostPreviewCard key={d.id} d={d} />
          : <EmptyPostsSlot key={`empty-${i}`} />
        )}
      </section>

      {/* Right rail */}
      <aside className="col-span-12 lg:col-span-4 flex flex-col gap-lg">
        {/* Repo activity */}
        <div className="glass-card p-md rounded-xl flex flex-col gap-md">
          <div className="flex items-center justify-between">
            <h3 className="font-mono text-label-caps uppercase tracking-widest text-on-surface-variant">
              Recent Activity
            </h3>
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse-dot" />
          </div>
          <div className="flex flex-col gap-sm">
            {activity.length === 0 && (
              <p className="font-mono text-code-sm text-outline-variant py-4 text-center">
                No generations yet.
              </p>
            )}
            {activity.slice(0, 4).map(a => (
              <Link
                key={a.id}
                href={`/jobs/${a.id}`}
                className="flex items-start gap-md p-sm hover:bg-white/5 rounded-md transition-colors group"
              >
                <CommitGlyph />
                <div className="min-w-0">
                  <p className="font-mono text-code-sm text-on-surface leading-none truncate">{a.repoName}</p>
                  <p className="text-[10px] text-on-surface-variant mt-1 truncate">{a.detail}</p>
                  <p className="font-mono text-[9px] text-primary/60 mt-0.5 uppercase tracking-widest">
                    {STATUS_LABEL[a.status] ?? a.status} · {relTime(a.at)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Generation history chart */}
        <div className="glass-card p-md rounded-xl h-[220px] flex flex-col gap-md">
          <h3 className="font-mono text-label-caps uppercase tracking-widest text-on-surface-variant">
            Generation History
          </h3>
          <div className="flex-1 flex items-end gap-1.5 px-sm">
            {history.map((v, i) => {
              const pct = Math.max(8, (v / maxHist) * 100)
              const isLast = i === history.length - 1
              return (
                <div
                  key={i}
                  className={`flex-1 rounded-t transition-all ${isLast ? 'bg-primary' : 'bg-primary/20 hover:bg-primary/60'}`}
                  style={{ height: `${pct}%` }}
                />
              )
            })}
          </div>
          <div className="flex justify-between font-mono text-[10px] text-on-surface-variant uppercase">
            {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => <span key={d}>{d}</span>)}
          </div>
        </div>

        {/* Upgrade promo */}
        <div className="relative overflow-hidden glass-card p-lg rounded-xl flex flex-col gap-sm bg-gradient-to-br from-primary/10 to-transparent border-primary/20">
          <div className="z-10 relative">
            <h4 className="font-display text-sm font-bold text-on-surface">Upgrade to Pro</h4>
            <p className="text-code-sm text-on-surface-variant leading-relaxed mt-sm">
              Unlimited repos, fine-tuned voice, scheduled posting, and team workspaces.
            </p>
            <button className="mt-md py-sm px-md bg-primary text-on-primary font-bold rounded-lg text-xs hover:bg-primary-container transition-colors">
              Explore Pro
            </button>
          </div>
          <svg className="absolute -right-4 -bottom-4 w-32 h-32 text-primary opacity-10 rotate-12" fill="currentColor" viewBox="0 0 24 24">
            <path d="M9.315 7.584C12.195 3.883 16.695 1.5 21.75 1.5a.75.75 0 01.75.75c0 5.056-2.383 9.555-6.084 12.436A6.75 6.75 0 019.75 22.5a.75.75 0 01-.75-.75v-4.131A15.838 15.838 0 016.382 15H2.25a.75.75 0 01-.75-.75 6.75 6.75 0 017.815-6.666zM15 6.75a2.25 2.25 0 100 4.5 2.25 2.25 0 000-4.5z"/>
          </svg>
        </div>
      </aside>
    </div>
  )
}
