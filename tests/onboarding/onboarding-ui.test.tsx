import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/settings',
}))
vi.mock('next-auth/react', () => ({ signIn: vi.fn(), signOut: vi.fn() }))

vi.mock('@/app/settings/actions', () => ({ ensureDefaultVoiceProfile: vi.fn(async () => ({ created: false })) }))

import { OnboardingStepper } from '@/components/onboarding-stepper'
import { VoiceProfileManager } from '@/components/voice-profile-manager'
import { AccountPanel } from '@/components/settings-account'
import { ProfileForm } from '@/components/settings/profile-form'

const state = {
  profile: {
    userId: 'u1',
    role: null,
    pitch: null,
    audiences: [],
    platforms: ['linkedin', 'twitter'],
    tonePreset: null,
    timezone: 'Asia/Kolkata',
    country: 'IN',
    onboardingStep: 'repos',
    onboardedAt: null,
    trialEndsAt: '2026-11-15T00:00:00.000Z',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  },
  autopilot: {
    enabled: false,
    cadence: 'ship_moments',
    postDays: [2, 4],
    postTime: '09:00',
    triggers: ['pr_merged'],
    platforms: ['linkedin', 'twitter'],
    approvalMode: 'review',
    reviewerEmails: [],
    defaultVoiceProfileId: null,
    pausedUntil: null,
    timezone: 'Asia/Kolkata',
  },
  repos: [],
  linkedin: null,
  linkedinAvailable: true,
  plan: { id: 'pro', status: 'trialing', trialEndsAt: '2026-11-15T00:00:00.000Z' },
}

const githubRepos = [
  {
    githubRepoId: '1',
    name: 'commitflex',
    fullName: 'ritvik/commitflex',
    url: 'https://github.com/ritvik/commitflex',
    defaultBranch: 'main',
    isPrivate: false,
    description: 'Commits to posts',
    language: 'TypeScript',
    updatedAt: '2026-10-30T00:00:00.000Z',
  },
  {
    githubRepoId: '2',
    name: 'dotfiles',
    fullName: 'ritvik/dotfiles',
    url: 'https://github.com/ritvik/dotfiles',
    defaultBranch: 'main',
    isPrivate: true,
    description: null,
    language: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
]

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (url.startsWith('/api/onboarding?')) return jsonResponse(state)
    if (url === '/api/github/repos') return jsonResponse({ repos: githubRepos })
    if (url === '/api/repos' && method === 'POST') return jsonResponse({ repo: { id: 'repo-uuid-1' } }, 201)
    if (url === '/api/onboarding' && method === 'PATCH') return jsonResponse({ profile: state.profile })
    return jsonResponse({ error: `unexpected ${method} ${url}` }, 500)
  })
  global.fetch = fetchMock as unknown as typeof fetch
})

describe('OnboardingStepper', () => {
  it('loads, requires a repo, connects it and moves to the role question', async () => {
    const user = userEvent.setup()
    render(<OnboardingStepper user={{ name: 'Ritvik', email: 'r@example.dev' }} />)

    expect(await screen.findByRole('heading', { name: 'Which repos should CommitFlex watch?' })).toBeInTheDocument()
    await screen.findByText('commitflex')

    await user.click(screen.getByRole('button', { name: /continue/i }))
    expect(await screen.findByText('Pick at least one repo to continue.')).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: /commitflex/i }))
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(await screen.findByRole('heading', { name: 'What best describes you?' })).toBeInTheDocument()
    const post = fetchMock.mock.calls.find(([u, i]) => u === '/api/repos' && i?.method === 'POST')
    // Only the id goes to the server; it reads the rest from GitHub.
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ githubRepoId: '1' })
    // The slow half of the first run starts while the questions are answered.
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u, i]) => u === '/api/onboarding/prefetch' && i?.method === 'POST')).toBe(true),
    )
  })

  it('shows the trial note when more than one repo is picked', async () => {
    const user = userEvent.setup()
    render(<OnboardingStepper user={{ name: 'Ritvik' }} />)
    await screen.findByText('commitflex')
    await user.click(screen.getByRole('checkbox', { name: /commitflex/i }))
    await user.click(screen.getByRole('checkbox', { name: /dotfiles/i }))
    expect(screen.getByText('Your trial includes 10 repos.')).toBeInTheDocument()
  })

  it('shows a retry when setup fails to load', async () => {
    fetchMock.mockImplementationOnce(async () => jsonResponse({ error: 'Database is resting' }, 500))
    render(<OnboardingStepper user={{ name: 'Ritvik' }} />)
    expect(await screen.findByText('Database is resting')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })
})

describe('Settings panels', () => {
  it('renders the voice profile manager and marks the default', () => {
    render(
      <VoiceProfileManager
        maxProfiles={5}
        initialProfiles={[
          { id: 'p1', name: 'Default', isDefault: true, tone: 'analytical', technicalLevel: 8, audience: 'developers', extraContext: null },
          { id: 'p2', name: 'Casual', isDefault: false, tone: 'casual', technicalLevel: 4, audience: 'founders', extraContext: 'Short.' },
        ]}
      />,
    )
    const list = screen.getByRole('list', { name: 'Voice profiles' })
    expect(within(list).getByText('Default', { selector: 'span.truncate' })).toBeInTheDocument()
    expect(screen.getByText('2 of 5')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled()
  })

  it('renders the account panel with the trial line', () => {
    render(
      <AccountPanel
        user={{ name: 'Ritvik', email: 'r@example.dev', image: null }}
        joinedAt="2026-11-01T00:00:00.000Z"
        plan={{ id: 'pro', status: 'trialing', trialEndsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(), currentPeriodEnd: null }}
      />,
    )
    expect(screen.getByText(/Pro trial ends in 3 days/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeInTheDocument()
  })

  it('shows the save bar only after a change', async () => {
    const user = userEvent.setup()
    render(
      <ProfileForm
        user={{ name: 'Ritvik', email: null, image: null }}
        profile={{ role: 'founder', pitch: '', audiences: ['developers'], timezone: 'UTC' }}
      />,
    )
    expect(screen.queryByRole('region', { name: 'Unsaved changes' })).not.toBeInTheDocument()
    await user.type(screen.getByPlaceholderText(/feature flag service/), 'A CLI')
    await waitFor(() => expect(screen.getByRole('region', { name: 'Unsaved changes' })).toBeInTheDocument())
  })
})
