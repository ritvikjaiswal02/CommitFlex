import { describe, it, expect } from 'vitest'
import { render } from '@react-email/components'
import { ApprovalRequestEmail } from '@/lib/email/templates/approval-request'
import { ScheduledSummaryEmail } from '@/lib/email/templates/scheduled-summary'
import { ReadyToPostEmail } from '@/lib/email/templates/ready-to-post'
import { PublishStatusEmail } from '@/lib/email/templates/publish-status'
import { LimitReachedEmail } from '@/lib/email/templates/limit-reached'
import { BillingNoticeEmail, billingNoticeSubject } from '@/lib/email/templates/billing-notice'
import { WelcomeEmail } from '@/lib/email/templates/welcome'
import { GenerationCompleteEmail } from '@/lib/email/templates/generation-complete'
import { WeeklyDigestEmail } from '@/lib/email/templates/weekly-digest'

const appUrl = 'https://app.commitflex.test'

describe('email templates', () => {
  it('renders the approval request with one Approve link per platform', async () => {
    const html = await render(
      ApprovalRequestEmail({
        firstName: 'Ada',
        repoName: 'acme/widget',
        sourceTitle: 'pull request #9',
        appUrl,
        reviewUrl: `${appUrl}/queue`,
        items: [
          { platform: 'linkedin', content: 'Post A', when: 'Goes out Tue', approveUrl: `${appUrl}/api/drafts/approve?token=a`, skipUrl: null },
          { platform: 'twitter', content: 'Post B', when: null, approveUrl: `${appUrl}/api/drafts/approve?token=b`, skipUrl: null },
        ],
      }),
    )
    expect(html).toContain('Approve for LinkedIn')
    expect(html).toContain('Approve for X')
    expect(html).toContain('token=a')
    expect(html).not.toMatch(/→/)
  })

  it('renders every other template without throwing', async () => {
    const all = await Promise.all([
      render(ScheduledSummaryEmail({ firstName: 'Ada', repoName: 'a/b', sourceTitle: null, appUrl, queueUrl: appUrl, items: [{ platform: 'linkedin', content: 'x', when: 'Tue', skipUrl: appUrl }] })),
      render(ReadyToPostEmail({ firstName: 'Ada', appUrl, queueUrl: appUrl, extensionUrl: appUrl, items: [{ platform: 'twitter', content: 'x', intentUrl: 'https://x.com/intent/post?text=x', postedUrl: appUrl }] })),
      render(PublishStatusEmail({ kind: 'published', firstName: 'Ada', appUrl, content: 'x', postUrl: 'https://linkedin.com/x' })),
      render(PublishStatusEmail({ kind: 'failed', firstName: 'Ada', appUrl, content: 'x', error: 'Duplicate' })),
      render(PublishStatusEmail({ kind: 'linkedin_expired', firstName: 'Ada', appUrl })),
      render(PublishStatusEmail({ kind: 'linkedin_expiring', firstName: 'Ada', appUrl, expiresOn: 'Fri, 14 Nov' })),
      render(LimitReachedEmail({ firstName: 'Ada', used: 10, max: 10, planName: 'Free', nextPlanName: 'Pro', nextPlanMax: 150, skipped: null, appUrl })),
      render(WelcomeEmail({ firstName: 'Ada', dashboardUrl: `${appUrl}/dashboard`, extensionUrl: `${appUrl}/extension`, linkedinConnected: false })),
      render(GenerationCompleteEmail({ firstName: 'Ada', repoName: 'a/b', draftCount: 2, jobUrl: `${appUrl}/jobs/1` })),
      render(WeeklyDigestEmail({ firstName: 'Ada', weekRange: '6 May to 12 May', items: [{ repoName: 'a/b', draftCount: 2, jobUrl: appUrl }], dashboardUrl: `${appUrl}/dashboard` })),
      ...(['activated', 'payment_failed', 'cancelled', 'trial_ending', 'trial_ended'] as const).map((kind) =>
        render(BillingNoticeEmail({ firstName: 'Ada', kind, planName: 'Pro', manageUrl: `${appUrl}/billing`, periodEnd: '14 Nov 2026', stats: { drafted: 4, published: 2 } })),
      ),
    ])
    for (const html of all) expect(html).toContain('CommitFlex')
    expect(all[2]).toContain('View on LinkedIn')
    expect(billingNoticeSubject('activated', 'Team')).toBe("You're on CommitFlex Team")
  })
})
