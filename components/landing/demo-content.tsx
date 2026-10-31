import * as React from 'react'

/**
 * Sample content for the marketing pages. Everything here comes from
 * CommitFlex's own repository (real commits, real file counts) so the demos
 * show the product writing about real work rather than invented numbers.
 * Text wrapped in <Marked> is the part CommitFlex pulled from the commits.
 */

export function Marked({ children }: { children: React.ReactNode }) {
  return <span className="marker">{children}</span>
}

/** Commit ec2a23c in ritvikjaiswal02/CommitFlex. */
export const DEMO_PR = {
  repo: 'ritvikjaiswal02/CommitFlex',
  title: 'generate from PR or release tag',
  sha: 'ec2a23c',
  additions: 2000,
  deletions: 55,
  files: 12,
  when: 'just now',
} as const

export const DEMO_LINKEDIN_DRAFT: React.ReactNode[] = [
  <>
    CommitFlex used to write only about a date range of commits. As of this week it can also write about{' '}
    <Marked>a single pull request or a release tag</Marked>.
  </>,
  <>
    Paste a PR link and the post covers that PR&apos;s commits and description. Give it a tag and it compares against
    the previous release, so the post is about exactly what shipped.
  </>,
  <>
    All three sources go through <Marked>one zod union</Marked>, so the pipeline didn&apos;t need a second code path.
  </>,
]

export const DEMO_SCHEDULE = {
  when: 'Tue, 9:00',
  zone: 'IST',
  note: 'The next free slot in a twice-a-week cadence.',
} as const

export type DemoTone = 'plain_technical' | 'story_led' | 'confident_founder' | 'teacher' | 'casual'

/** The same commit (ec2a23c) written in each tone preset. Static, so no AI call is made on the page. */
export const TONE_EXAMPLES: { value: DemoTone; label: string; description: string; post: React.ReactNode }[] = [
  {
    value: 'plain_technical',
    label: 'Plain and technical',
    description: 'Says what changed and why it matters. No hype.',
    post: (
      <>
        CommitFlex can now draft a post from <Marked>a single pull request or a release tag</Marked>, not only a date
        range. Release mode compares against the previous tag, so the post covers exactly what shipped.
      </>
    ),
  },
  {
    value: 'story_led',
    label: 'Story-led',
    description: 'Opens with the problem, ends with what you learned.',
    post: (
      <>
        I kept writing posts about a whole week of commits when the interesting part was one pull request. So CommitFlex
        now takes <Marked>a single PR or a release tag</Marked> as its source. What I learned: the unit of a story is
        the change, not the calendar.
      </>
    ),
  },
  {
    value: 'confident_founder',
    label: 'Confident founder',
    description: "Momentum, outcomes, what's next.",
    post: (
      <>
        New in CommitFlex: point it at <Marked>one pull request or a release tag</Marked> and get a post about exactly
        that change. Release posts compare against the previous tag. Next up: drafts the moment a PR merges.
      </>
    ),
  },
  {
    value: 'teacher',
    label: 'Teacher',
    description: 'Explains one idea clearly enough to learn from.',
    post: (
      <>
        If you want a release post that only covers what changed, compare tags, not dates. That is how CommitFlex&apos;s
        new <Marked>release tag</Marked> mode works: it diffs the new tag against the previous one and writes about the
        difference.
      </>
    ),
  },
  {
    value: 'casual',
    label: 'Casual',
    description: 'Short, friendly, like a message to a friend.',
    post: (
      <>
        Small one: CommitFlex now writes posts from <Marked>a single PR or a release tag</Marked>. Way less noise than a
        whole week of commits.
      </>
    ),
  },
]

/** Queue items shown in the extension mock, based on commits d3430f9 and 6a7df92. */
export const DEMO_EXTENSION_QUEUE: {
  status: 'ready' | 'scheduled' | 'pending_review'
  label: string
  text: string
  repo: string
}[] = [
  {
    status: 'ready',
    label: 'Ready to post',
    repo: 'CommitFlex',
    text: 'You can now keep several voice profiles in CommitFlex and switch the default in one click. One for LinkedIn essays, one for quick release notes.',
  },
  {
    status: 'scheduled',
    label: 'Thu, 9:00',
    repo: 'CommitFlex',
    text: 'Connect a repo once and CommitFlex installs a webhook with its own secret. Every push to the default branch can draft the post for you.',
  },
  {
    status: 'pending_review',
    label: 'Needs review',
    repo: 'CommitFlex',
    text: 'Weekly digest: voice profiles, PR and release sources, and a calmer dashboard. Three changes, one post.',
  },
]
