import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import {
  QUEUE_TABS,
  countByTab,
  describeWhen,
  isQueueTabKey,
  nodeStateFor,
  publishLabel,
  sortByRecent,
  sortQueue,
  tabForStatus,
  triggerLabel,
} from '@/components/app/queue-meta'
import { BarList, StackedBarChart, labelEvery, niceMax } from '@/components/app/charts'
import { describeJobSource, isJobRunning, jobBadge, stageIndex } from '@/components/app/job-meta'
import { makeItem } from './fixtures'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
}))

const NOW = new Date('2026-11-03T04:30:00.000Z')

describe('queue meta', () => {
  it('maps statuses to tabs', () => {
    expect(tabForStatus('pending_review')).toBe('review')
    expect(tabForStatus('approved')).toBe('scheduled')
    expect(tabForStatus('publishing')).toBe('scheduled')
    expect(tabForStatus('ready')).toBe('ready')
    expect(tabForStatus('skipped')).toBe('closed')
    expect(isQueueTabKey('published')).toBe(true)
    expect(isQueueTabKey('everything')).toBe(false)
    expect(QUEUE_TABS.flatMap((t) => t.statuses)).toHaveLength(8)
  })

  it('counts items per tab', () => {
    const counts = countByTab([
      makeItem({ status: 'pending_review' }),
      makeItem({ status: 'pending_review' }),
      makeItem({ status: 'scheduled' }),
      makeItem({ status: 'failed' }),
      makeItem({ status: 'skipped' }),
    ])
    expect(counts).toEqual({ review: 2, scheduled: 1, ready: 0, published: 0, closed: 2 })
  })

  it('sorts by slot, undated last, newest first among ties', () => {
    const items = [
      makeItem({ id: 'none-old', scheduledFor: null, createdAt: '2026-11-01T00:00:00Z' }),
      makeItem({ id: 'late', scheduledFor: '2026-11-06T00:00:00Z' }),
      makeItem({ id: 'none-new', scheduledFor: null, createdAt: '2026-11-02T00:00:00Z' }),
      makeItem({ id: 'early', scheduledFor: '2026-11-04T00:00:00Z' }),
    ]
    expect(sortQueue(items).map((i) => i.id)).toEqual(['early', 'late', 'none-new', 'none-old'])
  })

  it('sorts published items by most recent', () => {
    const items = [
      makeItem({ id: 'a', publishedAt: '2026-11-01T00:00:00Z' }),
      makeItem({ id: 'b', publishedAt: null, updatedAt: '2026-11-03T00:00:00Z' }),
      makeItem({ id: 'c', publishedAt: '2026-11-02T00:00:00Z' }),
    ]
    expect(sortByRecent(items).map((i) => i.id)).toEqual(['b', 'c', 'a'])
  })

  it('describes when a row happens', () => {
    expect(describeWhen(makeItem({ status: 'scheduled' }), 'Asia/Kolkata', NOW)).toBe('Goes out Thu at 09:00')
    expect(describeWhen(makeItem({ status: 'pending_review', scheduledFor: null }), 'UTC', NOW)).toBe('No slot yet')
    expect(describeWhen(makeItem({ status: 'publishing' }), 'UTC', NOW)).toBe('Publishing now')
    expect(
      describeWhen(makeItem({ status: 'published', publishedAt: '2026-11-03T04:00:00Z' }), 'UTC', NOW),
    ).toBe('Published 30 min ago')
  })

  it('labels triggers, nodes and publish buttons', () => {
    expect(triggerLabel('release_published')).toBe('Release')
    expect(triggerLabel(null)).toBe('Manual draft')
    expect(triggerLabel('something_new')).toBe('Something new')
    expect(nodeStateFor(null)).toBe('draft')
    expect(nodeStateFor('ready')).toBe('ready')
    expect(publishLabel('twitter', true)).toBe('Post on X')
    expect(publishLabel('linkedin', true)).toBe('Publish now')
    expect(publishLabel('linkedin', false)).toBe('Post on LinkedIn')
  })
})

describe('job meta', () => {
  it('tracks stages', () => {
    expect(stageIndex('queued')).toBe(0)
    expect(stageIndex('summarizing')).toBe(2)
    expect(stageIndex('completed')).toBe(5)
    expect(stageIndex('failed')).toBe(-1)
    expect(isJobRunning('generating_posts')).toBe(true)
    expect(isJobRunning('partial_completed')).toBe(false)
    expect(jobBadge('failed')).toEqual({ label: 'Failed', variant: 'danger' })
    expect(jobBadge('mystery_state').label).toBe('mystery state')
  })

  it('describes the source of a run', () => {
    const fmt = (d: string | Date) => new Date(d).toISOString().slice(0, 10)
    expect(
      describeJobSource({ sourceType: 'pr', sourceRef: 'https://github.com/o/r/pull/42', windowStart: '', windowEnd: '' }, fmt),
    ).toBe('Pull request #42')
    expect(describeJobSource({ sourceType: 'release', sourceRef: 'v1.2.0', windowStart: '', windowEnd: '' }, fmt)).toBe(
      'Release v1.2.0',
    )
    expect(
      describeJobSource(
        { sourceType: 'window', sourceRef: null, windowStart: '2026-10-27T00:00:00Z', windowEnd: '2026-11-03T00:00:00Z' },
        fmt,
      ),
    ).toBe('2026-10-27 to 2026-11-03')
  })
})

describe('charts', () => {
  it('rounds the axis to even steps', () => {
    expect(niceMax(0)).toBe(2)
    expect(niceMax(3)).toBe(4)
    expect(niceMax(7)).toBe(8)
    expect(niceMax(23)).toBe(30)
    expect(niceMax(130)).toBe(200)
  })

  it('thins x labels for long ranges', () => {
    expect(labelEvery(7)).toBe(1)
    expect(labelEvery(30)).toBe(5)
    expect(labelEvery(90)).toBe(12)
  })

  it('renders an accessible table of the chart data', () => {
    render(
      <StackedBarChart
        title="Posts per day"
        series={[
          { key: 'linkedin', label: 'LinkedIn', className: 'bg-accent' },
          { key: 'twitter', label: 'X', className: 'bg-fg' },
        ]}
        data={[
          { label: '2 Nov', longLabel: 'Mon, 2 Nov', values: { linkedin: 2, twitter: 1 } },
          { label: '3 Nov', longLabel: 'Tue, 3 Nov', values: { linkedin: 0, twitter: 3 } },
        ]}
      />,
    )
    const table = screen.getByRole('table', { name: 'Posts per day' })
    expect(table).toBeTruthy()
    expect(screen.getByRole('rowheader', { name: 'Mon, 2 Nov' })).toBeTruthy()
    expect(screen.getAllByRole('cell').map((c) => c.textContent)).toEqual(['2', '1', '0', '3'])
  })

  it('renders bar rows or the empty fallback', () => {
    const { rerender } = render(
      <BarList title="By source" rows={[{ key: 'a', label: 'Merged PR', value: 4 }]} empty={<p>Nothing</p>} />,
    )
    expect(screen.getByRole('list', { name: 'By source' })).toBeTruthy()
    expect(screen.getByText('Merged PR')).toBeTruthy()
    rerender(<BarList title="By source" rows={[]} empty={<p>Nothing</p>} />)
    expect(screen.getByText('Nothing')).toBeTruthy()
  })
})
