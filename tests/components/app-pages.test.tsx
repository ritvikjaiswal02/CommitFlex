import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import ApprovalResultPage from '@/app/queue/approved/page'
import { matchesDraftFilters } from '@/components/app/drafts-browser'
import { calendarInstant } from '@/components/app/calendar-view'
import { makeItem } from './fixtures'

vi.mock('@/lib/autopilot/approval', () => ({
  resolveApprovalToken: vi.fn(async () => ({ status: 'invalid' })),
  isApprovalAction: (v: unknown) => v === 'approve' || v === 'skip' || v === 'posted',
}))
vi.mock('@/lib/db/queries/drafts', () => ({ getDraft: vi.fn(async () => null) }))
vi.mock('@/lib/db/queries/autopilot', () => ({
  draftContent: (d: { editedContent: string | null; originalContent: string }) => d.editedContent ?? d.originalContent,
  draftHashtags: () => [],
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
}))

const DRAFT = '0b9a7d4e-8f2c-4d0b-9a51-3c1f6e2d7a90'

describe('approval result page', () => {
  it('confirms an approval with one link to the draft and one to change the time', async () => {
    render(
      await ApprovalResultPage({
        searchParams: { status: 'approved', draft: DRAFT, platform: 'linkedin', at: '2026-11-05T03:30:00.000Z' },
      }),
    )
    expect(screen.getByRole('heading', { name: 'Approved' })).toBeTruthy()
    expect(screen.getByText('LinkedIn post')).toBeTruthy()
    expect(screen.getByText(/Goes out/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open in queue' }).getAttribute('href')).toBe(`/queue?draft=${DRAFT}`)
    expect(screen.getByRole('link', { name: 'Change the time' }).getAttribute('href')).toBe(`/queue?draft=${DRAFT}&schedule=1`)
  })

  it('explains an expired link', async () => {
    render(await ApprovalResultPage({ searchParams: { status: 'expired', draft: DRAFT } }))
    expect(screen.getByRole('heading', { name: 'This approval link expired' })).toBeTruthy()
    expect(screen.queryByText(/Goes out/)).toBeNull()
  })

  it('shows the post and a POST form when confirming (opening the link changes nothing)', async () => {
    const approval = await import('@/lib/autopilot/approval')
    const drafts = await import('@/lib/db/queries/drafts')
    vi.mocked(approval.resolveApprovalToken).mockResolvedValueOnce({
      status: 'ok',
      item: { draftId: DRAFT, platform: 'linkedin', scheduledFor: new Date('2026-11-05T03:30:00Z') } as never,
      email: 'dev@example.com',
      tokenId: 't1',
      userId: 'u1',
      actions: ['approve', 'skip'],
    })
    vi.mocked(drafts.getDraft).mockResolvedValueOnce({
      id: DRAFT,
      originalContent: 'Shipped webhook retries with backoff.',
      editedContent: null,
      platformMetadata: {},
    } as never)
    const { container } = render(
      await ApprovalResultPage({ searchParams: { preview: '1', token: 'tok_'.padEnd(30, 'x'), action: 'approve' } }),
    )
    expect(screen.getByRole('heading', { name: 'Approve this post?' })).toBeTruthy()
    expect(screen.getByText('Shipped webhook retries with backoff.')).toBeTruthy()
    const form = container.querySelector('form')!
    expect(form.getAttribute('method')).toBe('post')
    expect(form.getAttribute('action')).toBe('/api/drafts/approve')
    expect(screen.getByRole('button', { name: 'Approve for LinkedIn' })).toBeTruthy()
  })

  it('treats unknown input as an invalid link and ignores bad ids', async () => {
    render(await ApprovalResultPage({ searchParams: { status: 'hacked', draft: '../../etc', platform: 'myspace' } }))
    expect(screen.getByRole('heading', { name: "This approval link doesn't work" })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open queue' }).getAttribute('href')).toBe('/queue')
  })
})

describe('drafts filters', () => {
  const draft = { platform: 'linkedin' as const, content: 'Shipped webhook retries', repoFullName: 'ritvik/commitflex' }
  const all = { state: 'all' as const, platform: 'all' as const, query: '' }

  it('filters by queue state', () => {
    expect(matchesDraftFilters(draft, null, { ...all, state: 'unqueued' })).toBe(true)
    expect(matchesDraftFilters(draft, 'scheduled', { ...all, state: 'unqueued' })).toBe(false)
    expect(matchesDraftFilters(draft, 'scheduled', { ...all, state: 'queued' })).toBe(true)
    expect(matchesDraftFilters(draft, 'published', { ...all, state: 'queued' })).toBe(false)
    expect(matchesDraftFilters(draft, 'published', { ...all, state: 'published' })).toBe(true)
  })

  it('filters by platform and search text', () => {
    expect(matchesDraftFilters(draft, null, { ...all, platform: 'twitter' })).toBe(false)
    expect(matchesDraftFilters(draft, null, { ...all, query: 'RETRIES' })).toBe(true)
    expect(matchesDraftFilters(draft, null, { ...all, query: 'commitflex' })).toBe(true)
    expect(matchesDraftFilters(draft, null, { ...all, query: 'billing' })).toBe(false)
  })
})

describe('calendar placement', () => {
  it('places published posts at their publish time and others at their slot', () => {
    expect(
      calendarInstant(makeItem({ status: 'published', publishedAt: '2026-11-04T10:00:00Z', scheduledFor: '2026-11-04T09:00:00Z' })),
    ).toBe('2026-11-04T10:00:00Z')
    expect(calendarInstant(makeItem({ status: 'scheduled', scheduledFor: '2026-11-04T09:00:00Z' }))).toBe('2026-11-04T09:00:00Z')
    expect(calendarInstant(makeItem({ status: 'pending_review', scheduledFor: null }))).toBeNull()
  })
})
