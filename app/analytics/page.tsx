import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getUserRepos } from '@/lib/db/queries/repos'
import { getUserJobs } from '@/lib/db/queries/jobs'
import { AppShell } from '@/components/app-sidebar'

const TERMINAL_OK = new Set(['completed', 'partial_completed'])

export default async function AnalyticsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const [repos, jobs] = await Promise.all([
    getUserRepos(session.user.id),
    getUserJobs(session.user.id, 200),
  ])

  // ── Real metrics ────────────────────────────────────────────────────────
  const totalGenerations = jobs.length
  const completedGenerations = jobs.filter(j => j.status === 'completed').length
  const completionRate = totalGenerations > 0 ? Math.round((completedGenerations / totalGenerations) * 100) : 0
  const failedGenerations = jobs.filter(j => j.status === 'failed').length

  // 7-day trend
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(today); day.setDate(day.getDate() - (6 - i))
    const next = new Date(day); next.setDate(next.getDate() + 1)
    const dayJobs = jobs.filter(j => j.createdAt >= day && j.createdAt < next)
    return {
      label: day.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
      generations: dayJobs.length,
      completions: dayJobs.filter(j => TERMINAL_OK.has(j.status)).length,
    }
  })
  const maxDay = Math.max(1, ...days.map(d => d.generations))
  const thisWeekTotal = days.reduce((a, d) => a + d.generations, 0)

  // Repo distribution
  const byRepo = new Map<string, number>()
  for (const j of jobs) byRepo.set(j.repoId, (byRepo.get(j.repoId) ?? 0) + 1)
  const repoMap = new Map(repos.map(r => [r.id, r.fullName]))
  const repoStats = Array.from(byRepo.entries())
    .map(([id, count]) => ({ name: repoMap.get(id) ?? '—', count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
  const maxRepoCount = Math.max(1, ...repoStats.map(r => r.count))
  const top = repoStats[0]

  // Headline takeaway
  const takeaway = thisWeekTotal === 0
    ? 'No generations this week yet — kick one off from the dashboard.'
    : top
      ? `Most active repo this period: ${top.name} with ${top.count} generation${top.count === 1 ? '' : 's'}.`
      : `${thisWeekTotal} generation${thisWeekTotal === 1 ? '' : 's'} in the last 7 days.`

  return (
    <AppShell user={{ name: session.user.name, email: session.user.email, image: session.user.image }}>
      {/* Header */}
      <header className="mb-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-md">
        <div>
          <h1 className="font-display text-display-lg font-bold tracking-tighter text-on-surface">
            Analytics
          </h1>
          <p className="text-on-surface-variant mt-1">
            Your generation activity at a glance.
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
        </div>
      </header>

      {/* Top row: trend chart + stat column */}
      <div className="grid grid-cols-12 gap-lg mb-lg">
        <section className="col-span-12 lg:col-span-8 glass-card rounded-xl p-lg">
          <div className="flex justify-between items-baseline mb-md">
            <div>
              <h3 className="font-display text-base font-bold text-on-surface">Generations this week</h3>
              <p className="font-mono text-code-sm text-on-surface-variant mt-1">
                Daily volume across all connected repos.
              </p>
            </div>
            <div className="flex gap-md font-mono text-code-sm">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-primary/40" /> Started</span>
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
                    title={`${d.generations} started`}
                  />
                  <div
                    className="flex-1 rounded-t bg-tertiary hover:opacity-80 transition-opacity"
                    style={{ height: `${(d.completions / maxDay) * 100}%`, minHeight: '4px' }}
                    title={`${d.completions} completed`}
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
              Completion rate
            </p>
            <p className="font-display text-display-lg font-bold text-tertiary mt-2">
              {completionRate}<span className="text-base text-on-surface-variant">%</span>
            </p>
            <p className="font-mono text-code-sm text-on-surface-variant mt-1">
              {completedGenerations} of {totalGenerations} succeeded
            </p>
          </div>
          <div className="glass-card rounded-xl p-lg">
            <p className="font-mono text-label-caps uppercase tracking-widest text-on-surface-variant">
              Total generations
            </p>
            <p className="font-display text-display-lg font-bold text-on-surface mt-2">
              {totalGenerations.toLocaleString()}
            </p>
            <p className="font-mono text-code-sm text-on-surface-variant mt-1">
              {failedGenerations > 0 ? `${failedGenerations} failed · ${repos.length} repo${repos.length === 1 ? '' : 's'}` : `${repos.length} repo${repos.length === 1 ? '' : 's'}`}
            </p>
          </div>
        </aside>
      </div>

      {/* Generations per repository — full width since we dropped the fake themes panel */}
      <section className="glass-card rounded-xl p-lg mb-lg">
        <h3 className="font-display text-base font-bold text-on-surface mb-md">Generations per repository</h3>
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
      </section>

      {/* Takeaway — clear english, no faux-terminal noise */}
      <section className="relative overflow-hidden glass-card rounded-xl p-xl">
        <div className="absolute inset-0 pointer-events-none cf-glow-primary opacity-40" />
        <div className="relative">
          <p className="font-mono text-label-caps uppercase tracking-widest text-primary mb-sm">
            This week at a glance
          </p>
          <h3 className="font-display text-headline-md font-bold text-on-surface mb-sm">
            {takeaway}
          </h3>
          <p className="text-on-surface-variant leading-relaxed max-w-3xl">
            {totalGenerations === 0
              ? 'Connect a repo and run your first generation to start seeing data here.'
              : `You've shipped ${totalGenerations.toLocaleString()} generation${totalGenerations === 1 ? '' : 's'} across ${repos.length} repo${repos.length === 1 ? '' : 's'}, with a ${completionRate}% completion rate. Keep an eye on the chart above — sustained daily activity translates to a steadier social cadence.`}
          </p>
        </div>
      </section>
    </AppShell>
  )
}
