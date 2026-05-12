import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getUserRepos } from '@/lib/db/queries/repos'
import { getUserJobs } from '@/lib/db/queries/jobs'
import { AppShell } from '@/components/app-sidebar'

export default async function AnalyticsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const [repos, jobs] = await Promise.all([
    getUserRepos(session.user.id),
    getUserJobs(session.user.id, 200),
  ])

  // Real metrics
  const totalGenerations = jobs.length
  const completedGenerations = jobs.filter(j => j.status === 'completed').length
  const completionRate = totalGenerations > 0 ? Math.round((completedGenerations / totalGenerations) * 100) : 0

  // Repo distribution
  const byRepo = new Map<string, number>()
  for (const j of jobs) byRepo.set(j.repoId, (byRepo.get(j.repoId) ?? 0) + 1)
  const repoMap = new Map(repos.map(r => [r.id, r.fullName]))
  const repoStats = Array.from(byRepo.entries())
    .map(([id, count]) => ({ name: repoMap.get(id) ?? '—', count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
  const maxRepoCount = Math.max(1, ...repoStats.map(r => r.count))

  // 7-day trend
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(today); day.setDate(day.getDate() - (6 - i))
    const next = new Date(day); next.setDate(next.getDate() + 1)
    const dayJobs = jobs.filter(j => j.createdAt >= day && j.createdAt < next)
    return {
      label: day.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
      generations: dayJobs.length,
      completions: dayJobs.filter(j => j.status === 'completed').length,
    }
  })
  const maxDay = Math.max(1, ...days.map(d => d.generations))

  return (
    <AppShell user={{ name: session.user.name, email: session.user.email, image: session.user.image }}>
      {/* Header */}
      <header className="mb-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-md">
        <div>
          <h1 className="font-display text-display-lg font-bold tracking-tighter text-on-surface">
            Analytics
          </h1>
          <p className="font-mono text-label-caps uppercase tracking-widest text-on-surface-variant mt-1">
            ID_SESSION: {(session.user.id ?? '').slice(0, 8).toUpperCase()} {'//'} PERFORMANCE_REPORT
          </p>
        </div>
        <div className="flex items-center gap-sm">
          {['7D', '30D', '90D'].map((r, i) => (
            <button
              key={r}
              className={`px-md py-sm rounded-md font-mono text-code-sm border transition-colors ${
                i === 0
                  ? 'bg-primary/10 text-primary border-primary/40'
                  : 'border-white/8 text-on-surface-variant hover:border-white/20'
              }`}
            >
              {r}
            </button>
          ))}
          <button className="btn-ghost h-9 px-3 rounded-md font-mono text-label-caps uppercase ml-2">
            Export Report
          </button>
        </div>
      </header>

      {/* Top row: trends + side stats */}
      <div className="grid grid-cols-12 gap-lg mb-lg">
        <section className="col-span-12 lg:col-span-8 glass-card rounded-xl p-lg">
          <div className="flex justify-between items-baseline mb-md">
            <div>
              <h3 className="font-display text-base font-bold text-on-surface">Engagement Trends</h3>
              <p className="font-mono text-code-sm text-on-surface-variant mt-1">
                Real-time generation activity across connected repositories.
              </p>
            </div>
            <div className="flex gap-md font-mono text-code-sm">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-primary/40" /> Generations</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-tertiary" /> Completed</span>
            </div>
          </div>
          {/* Chart */}
          <div className="h-[200px] flex items-end gap-3">
            {days.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full flex items-end gap-1 h-[160px]">
                  <div
                    className="flex-1 rounded-t bg-primary/30 hover:bg-primary/50 transition-colors"
                    style={{ height: `${(d.generations / maxDay) * 100}%`, minHeight: '4px' }}
                  />
                  <div
                    className="flex-1 rounded-t bg-tertiary transition-colors"
                    style={{ height: `${(d.completions / maxDay) * 100}%`, minHeight: '4px' }}
                  />
                </div>
                <span className="font-mono text-code-sm text-on-surface-variant uppercase">{d.label}</span>
              </div>
            ))}
          </div>
        </section>

        <aside className="col-span-12 lg:col-span-4 flex flex-col gap-md">
          <div className="glass-card rounded-xl p-lg">
            <p className="font-mono text-label-caps uppercase tracking-widest text-on-surface-variant">
              Completion Rate
            </p>
            <p className="font-display text-display-lg font-bold text-tertiary mt-2">
              {completionRate}%
            </p>
            <p className="font-mono text-code-sm text-on-surface-variant mt-1">
              {completedGenerations} of {totalGenerations} succeeded
            </p>
          </div>
          <div className="glass-card rounded-xl p-lg">
            <p className="font-mono text-label-caps uppercase tracking-widest text-on-surface-variant">
              Avg Cost per Repo
            </p>
            <p className="font-display text-display-lg font-bold text-on-surface mt-2">
              $<span className="text-primary">—</span>
            </p>
            <p className="font-mono text-code-sm text-outline-variant mt-1">Tracking soon</p>
          </div>
          <div className="glass-card rounded-xl p-lg">
            <p className="font-mono text-label-caps uppercase tracking-widest text-on-surface-variant">
              Total Generations
            </p>
            <p className="font-display text-display-lg font-bold text-on-surface mt-2">
              {totalGenerations.toLocaleString()}
            </p>
          </div>
        </aside>
      </div>

      {/* Bottom row: cost per repo + content themes */}
      <div className="grid grid-cols-12 gap-lg mb-lg">
        <section className="col-span-12 lg:col-span-6 glass-card rounded-xl p-lg">
          <h3 className="font-display text-base font-bold text-on-surface mb-md">Generations per Repository</h3>
          <div className="space-y-3">
            {repoStats.length === 0 && (
              <p className="font-mono text-code-sm text-outline-variant py-6 text-center">
                No generations yet.
              </p>
            )}
            {repoStats.map(r => (
              <div key={r.name}>
                <div className="flex justify-between font-mono text-code-sm mb-1">
                  <span className="text-on-surface truncate">{r.name}</span>
                  <span className="text-on-surface-variant">{r.count}</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${(r.count / maxRepoCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          {repoStats.length > 0 && (
            <button className="btn-ghost w-full h-9 rounded-md mt-md font-mono text-label-caps uppercase">
              View Full Billing Table
            </button>
          )}
        </section>

        <section className="col-span-12 lg:col-span-6 glass-card rounded-xl p-lg">
          <h3 className="font-display text-base font-bold text-on-surface mb-md">Top Performing Content Themes</h3>
          <div className="flex flex-wrap gap-x-md gap-y-sm">
            {[
              { tag: 'TypeScript',       size: 'text-2xl', color: 'text-on-surface' },
              { tag: 'Rust Core',        size: 'text-xl',  color: 'text-on-surface-variant' },
              { tag: 'Optimization',     size: 'text-2xl', color: 'text-primary' },
              { tag: 'CI/CD Pipeline',   size: 'text-lg',  color: 'text-on-surface-variant' },
              { tag: 'Architecture',     size: 'text-2xl', color: 'text-on-surface' },
              { tag: 'API Design',       size: 'text-xl',  color: 'text-primary' },
              { tag: 'Web3 Integration', size: 'text-lg',  color: 'text-on-surface-variant' },
              { tag: 'Security Best Practices', size: 'text-base', color: 'text-on-surface-variant' },
              { tag: 'Machine Learning', size: 'text-2xl', color: 'text-on-surface' },
            ].map(t => (
              <span key={t.tag} className={`font-display font-bold tracking-tighter ${t.size} ${t.color}`}>
                {t.tag}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-sm mt-lg">
            {[
              { label: 'Top Tag Performance', value: '—' },
              { label: 'Sentiment',           value: '—' },
              { label: 'Audience',            value: 'Senior Eng.' },
            ].map(s => (
              <div key={s.label} className="rounded-md border border-white/8 p-sm text-center">
                <p className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant">{s.label}</p>
                <p className="font-mono text-code-sm text-on-surface mt-0.5">{s.value}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Insights summary */}
      <section className="relative overflow-hidden glass-card rounded-xl p-xl">
        <div className="absolute inset-0 pointer-events-none cf-glow-primary opacity-50" />
        <div className="relative">
          <p className="font-mono text-label-caps uppercase tracking-widest text-primary mb-sm">
            AI_INSIGHTS: INCREASED_TO_OUTPUT
          </p>
          <h3 className="font-display text-headline-md font-bold text-on-surface mb-sm">
            Automated Insights Summary
          </h3>
          <p className="text-on-surface-variant leading-relaxed max-w-3xl">
            Your repository <span className="text-on-surface font-mono">{repoStats[0]?.name ?? 'core-engine'}</span> has
            generated <span className="text-primary font-mono">{repoStats[0]?.count ?? 0}</span> posts this period.
            AI-generated technical narratives consistently outperform manual descriptions in early signals.
          </p>
        </div>
      </section>
    </AppShell>
  )
}
