/**
 * GitHub: a "Draft a post" button on merged pull requests and release pages.
 * It starts a CommitFlex job for that PR or release, shows progress on a
 * commit-node rail, then lists the drafts with Copy and a link to the job.
 * The background worker also raises a "Drafts ready" notification.
 */
import { copyText, h, replaceChildren } from '../shared/dom'
import { platformLabel } from '../shared/format'
import { brandIcon, icon, logoMark, spinner } from '../shared/icons'
import { sendToBackground } from '../shared/messages'
import { getSettings, onSettingsChanged } from '../shared/storage'
import type { DraftFromGithubResponse, JobResponse, JobStatus } from '../shared/types'
import { renderCallout } from '../ui/item-list'
import { createOverlay, type Overlay } from './overlay'

type Target =
  | { kind: 'pr'; url: string; owner: string; repo: string; number: number; title: string }
  | { kind: 'release'; url: string; owner: string; repo: string; tag: string; title: string }

type PrState = 'merged' | 'open' | 'closed' | 'draft' | 'unknown'

const POLL_MS = 2500
const POLL_LIMIT_MS = 5 * 60 * 1000
/** When GitHub's header hasn't rendered a state yet, wait this long before showing the button anyway. */
const UNKNOWN_STATE_GRACE_MS = 3000

const STAGES: { status: JobStatus[]; label: string }[] = [
  { status: ['queued'], label: 'Queued' },
  { status: ['fetching_commits'], label: 'Reading the commits' },
  { status: ['summarizing'], label: 'Summarizing the changes' },
  { status: ['extracting_narrative'], label: 'Finding the story' },
  { status: ['generating_posts'], label: 'Writing your posts' },
]

/* ---------------------------------------------------------------- detection */

function cleanTitle(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim()
}

function readPrTitle(): string {
  const el =
    document.querySelector('.gh-header-title .js-issue-title') ??
    document.querySelector('[data-testid="issue-title"]') ??
    document.querySelector('h1 bdi') ??
    document.querySelector('h1')
  return cleanTitle(el?.textContent) || cleanTitle(document.title.split(' by ')[0])
}

function readPrState(): PrState {
  const candidates = document.querySelectorAll(
    '.gh-header-meta .State, .gh-header-sticky .State, [data-testid="header-state"], span.State, [class*="StateLabel"]',
  )
  for (const el of Array.from(candidates)) {
    const text = cleanTitle(el.textContent).toLowerCase()
    const title = (el.getAttribute('title') ?? '').toLowerCase()
    const value = `${text} ${title}`
    if (value.includes('merged')) return 'merged'
    if (value.includes('draft')) return 'draft'
    if (value.includes('closed')) return 'closed'
    if (value.includes('open')) return 'open'
  }
  if (document.querySelector('.State--merged, [title="Status: Merged"]')) return 'merged'
  return 'unknown'
}

function detectTarget(): Target | null {
  const parts = window.location.pathname.split('/').filter(Boolean)
  if (parts.length < 4) return null
  const [owner, repo, section, ...rest] = parts
  if (section === 'pull' && /^\d+$/.test(rest[0] ?? '')) {
    const number = Number(rest[0])
    return {
      kind: 'pr',
      owner,
      repo,
      number,
      url: `https://github.com/${owner}/${repo}/pull/${number}`,
      title: readPrTitle(),
    }
  }
  if (section === 'releases' && rest[0] === 'tag' && rest[1]) {
    const tag = decodeURIComponent(rest.slice(1).join('/'))
    const heading =
      document.querySelector('[data-testid="release-header"] h1, .release-header h1, h1.d-inline') ?? document.querySelector('h1')
    return {
      kind: 'release',
      owner,
      repo,
      tag,
      url: `https://github.com/${owner}/${repo}/releases/tag/${rest.slice(1).join('/')}`,
      title: cleanTitle(heading?.textContent) || tag,
    }
  }
  return null
}

/* ----------------------------------------------------------------------- UI */

let overlay: Overlay | null = null
let launcher: HTMLButtonElement | null = null
let panel: HTMLElement | null = null
let target: Target | null = null
let enabled = false
let unknownSince = 0
let pollTimer: ReturnType<typeof setTimeout> | null = null
let runToken = 0

function ensureOverlay(): Overlay {
  if (overlay && overlay.host.isConnected) return overlay
  overlay = createOverlay('commitflex-github')
  launcher = h(
    'button',
    {
      class: 'cx-launcher cx-focus',
      attrs: { type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', hidden: true },
    },
    logoMark(18),
    h('span', { text: 'Draft a post' }),
  )
  launcher.addEventListener('click', () => (panel ? closePanel() : openPanel()))
  overlay.root.appendChild(launcher)
  return overlay
}

function targetNoun(t: Target): string {
  return t.kind === 'pr' ? 'pull request' : 'release'
}

function update(): void {
  if (!enabled) return
  const next = detectTarget()
  const changed = (next?.url ?? null) !== (target?.url ?? null)
  // Keep the same object while the URL is unchanged, so in-flight work can tell it's still current.
  if (changed || !target) target = next
  if (changed) {
    unknownSince = Date.now()
    closePanel()
  }
  if (!target) {
    if (launcher) launcher.hidden = true
    return
  }
  let show = true
  if (target.kind === 'pr') {
    const state = readPrState()
    if (state === 'open' || state === 'closed' || state === 'draft') show = false
    else if (state === 'unknown') show = Date.now() - unknownSince > UNKNOWN_STATE_GRACE_MS
  }
  ensureOverlay()
  if (launcher) {
    launcher.hidden = !show
    launcher.setAttribute('aria-label', `Draft a post about this ${targetNoun(target)} with CommitFlex`)
  }
  if (!show) closePanel()
}

function closePanel(): void {
  runToken++
  if (pollTimer) clearTimeout(pollTimer)
  pollTimer = null
  panel?.remove()
  panel = null
  launcher?.setAttribute('aria-expanded', 'false')
  document.removeEventListener('pointerdown', onOutside, true)
}

function onOutside(event: PointerEvent): void {
  if (overlay && !event.composedPath().includes(overlay.host)) closePanel()
}

function openPanel(): void {
  if (!target) return
  const o = ensureOverlay()
  panel = h('div', {
    class: 'cx-panel cx-gh-panel',
    attrs: { role: 'dialog', 'aria-label': 'Draft a post with CommitFlex', tabindex: '-1' },
  })
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closePanel()
      launcher?.focus()
    }
  })
  o.root.appendChild(panel)
  launcher?.setAttribute('aria-expanded', 'true')
  document.addEventListener('pointerdown', onOutside, true)
  void renderIdle()
  panel.focus({ preventScroll: true })
}

function head(): HTMLElement {
  return h(
    'div',
    { class: 'cx-panel-head' },
    h('div', { class: 'cx-panel-title' }, logoMark(18), h('span', { text: 'CommitFlex' })),
    h('span', { class: 'cx-spacer' }),
    h(
      'button',
      {
        class: 'cx-btn cx-btn--ghost cx-btn--xs cx-btn--icon cx-focus',
        attrs: { type: 'button', 'aria-label': 'Close' },
        on: {
          click: () => {
            closePanel()
            launcher?.focus()
          },
        },
      },
      icon('x', 14),
    ),
  )
}

function targetCard(t: Target): HTMLElement {
  return h(
    'div',
    { class: 'cx-target' },
    icon(t.kind === 'pr' ? 'gitPullRequest' : 'tag', 16),
    h(
      'div',
      { style: { minWidth: '0' } },
      h('p', { class: 'cx-target-title', text: t.title }),
      h('p', {
        class: 'cx-mono cx-muted',
        text: t.kind === 'pr' ? `${t.owner}/${t.repo}#${t.number}` : `${t.owner}/${t.repo}@${t.tag}`,
      }),
    ),
  )
}

function show(...children: (HTMLElement | null)[]): void {
  if (!panel) return
  replaceChildren(panel, head(), h('div', { class: 'cx-panel-body' }, h('div', { class: 'cx-panel-section' }, children)))
}

async function renderIdle(): Promise<void> {
  const t = target
  if (!t || !panel) return
  show(targetCard(t), h('div', { class: 'cx-skeleton', style: { height: '36px' } }))
  const state = await sendToBackground({ type: 'state:get' })
  if (!panel || target?.url !== t.url) return

  if (!state.ok || !state.data.connected) {
    const invalid = state.ok && state.data.invalid
    show(
      targetCard(t),
      renderCallout(
        invalid ? 'warning' : 'info',
        invalid ? 'Your extension token stopped working' : 'Connect your CommitFlex account',
        invalid
          ? 'It was revoked or has expired. Connect the extension again from CommitFlex.'
          : `CommitFlex turns this ${targetNoun(t)} into a LinkedIn post and an X post once the extension is connected.`,
        [
          h('button', {
            class: 'cx-btn cx-btn--primary cx-btn--xs cx-focus',
            attrs: { type: 'button' },
            text: invalid ? 'Connect again' : 'Connect CommitFlex',
            on: { click: () => void sendToBackground({ type: 'open:app', path: '/extension' }) },
          }),
        ],
      ),
    )
    return
  }

  const start = h(
    'button',
    { class: 'cx-btn cx-btn--primary cx-btn--md cx-btn--block cx-focus', attrs: { type: 'button' } },
    h('span', { text: 'Draft a post' }),
  )
  start.addEventListener('click', () => void startDraft(t))
  show(
    targetCard(t),
    h('p', {
      class: 'cx-muted',
      text:
        t.kind === 'pr'
          ? 'CommitFlex reads the title, description and commits, then writes a LinkedIn post and an X post in your voice.'
          : 'CommitFlex reads the release notes and the commits since the last release, then writes a LinkedIn post and an X post in your voice.',
    }),
    start,
  )
  start.focus({ preventScroll: true })
}

function stageList(status: JobStatus): HTMLElement {
  const activeIndex = Math.max(0, STAGES.findIndex((s) => s.status.includes(status)))
  return h(
    'ol',
    { class: 'cx-stages', attrs: { 'aria-label': 'Progress' } },
    STAGES.map((stage, index) => {
      const state = index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'pending'
      const node =
        state === 'done' ? icon('check', 14) : state === 'active' ? spinner(14) : h('span', { class: 'cx-dot' })
      return h(
        'li',
        { class: 'cx-stage', dataset: { state }, attrs: state === 'active' ? { 'aria-current': 'step' } : {} },
        h('span', { class: 'cx-stage-node' }, node),
        h('span', { text: stage.label }),
      )
    }),
  )
}

function openButton(url: string, text = 'Open in CommitFlex', primary = true): HTMLElement {
  return h(
    'button',
    {
      class: `cx-btn ${primary ? 'cx-btn--primary' : 'cx-btn--secondary'} cx-btn--xs cx-focus`,
      attrs: { type: 'button' },
      on: { click: () => void sendToBackground({ type: 'open:url', url }) },
    },
    h('span', { text }),
    icon('externalLink', 14),
  )
}

async function startDraft(t: Target): Promise<void> {
  const token = ++runToken
  show(targetCard(t), h('div', { class: 'cx-stages' }, h('p', { class: 'cx-muted', text: 'Starting…' })))
  const result = await sendToBackground({ type: 'github:draft', url: t.url })
  if (token !== runToken || !panel) return

  if (!result.ok) {
    const body = result.body ?? {}
    if (result.code === 'repo_not_connected') {
      const connectButton = h(
        'button',
        { class: 'cx-btn cx-btn--primary cx-btn--xs cx-focus', attrs: { type: 'button' } },
        h('span', { text: 'Connect and draft' }),
      )
      connectButton.addEventListener('click', async () => {
        if (connectButton.getAttribute('aria-disabled') === 'true') return
        connectButton.setAttribute('aria-disabled', 'true')
        const label = connectButton.querySelector('span')
        if (label) label.textContent = 'Connecting…'
        const connected = await sendToBackground({ type: 'repo:connect', fullName: `${t.owner}/${t.repo}` })
        if (token !== runToken || !panel) return
        if (!connected.ok) {
          show(
            targetCard(t),
            renderCallout('danger', `${t.owner}/${t.repo} didn't connect`, connected.error, [
              h('button', {
                class: 'cx-btn cx-btn--secondary cx-btn--xs cx-focus',
                attrs: { type: 'button' },
                text: 'Connect in CommitFlex',
                on: {
                  click: () =>
                    void sendToBackground({ type: 'open:app', path: typeof body.connectUrl === 'string' ? body.connectUrl : '/repositories' }),
                },
              }),
            ]),
          )
          return
        }
        // Connected: go straight on to the draft the user asked for.
        void startDraft(t)
      })
      show(
        targetCard(t),
        renderCallout(
          'info',
          `${t.owner}/${t.repo} isn't connected yet`,
          'Connect it to CommitFlex and the draft starts right away. Merged pull requests and releases will be drafted automatically from then on.',
          [connectButton],
        ),
      )
      return
    }
    if (result.code === 'active_job' && typeof body.jobUrl === 'string') {
      show(
        targetCard(t),
        renderCallout('info', 'Already writing drafts for this repository', 'Wait for that job to finish, then try again.', [
          openButton(body.jobUrl, 'Open the running job', false),
        ]),
      )
      return
    }
    if (result.status === 402) {
      show(
        targetCard(t),
        renderCallout('warning', 'Your plan is out of drafts', result.error, [
          h('button', {
            class: 'cx-btn cx-btn--primary cx-btn--xs cx-focus',
            attrs: { type: 'button' },
            text: 'See plans',
            on: { click: () => void sendToBackground({ type: 'open:app', path: '/billing' }) },
          }),
        ]),
      )
      return
    }
    show(
      targetCard(t),
      renderCallout('danger', "CommitFlex couldn't start drafting", result.error, [
        h('button', {
          class: 'cx-btn cx-btn--secondary cx-btn--xs cx-focus',
          attrs: { type: 'button' },
          text: 'Try again',
          on: { click: () => void startDraft(t) },
        }),
      ]),
    )
    return
  }

  void poll(t, result.data, token, Date.now())
}

async function poll(t: Target, job: DraftFromGithubResponse, token: number, startedAt: number): Promise<void> {
  if (token !== runToken || !panel) return
  const result = await sendToBackground({ type: 'job:get', jobId: job.jobId })
  if (token !== runToken || !panel) return

  if (result.ok && result.data.done) {
    renderDone(t, job, result.data)
    return
  }
  if (!result.ok && (result.status === 401 || result.status === 404)) {
    show(
      targetCard(t),
      renderCallout('danger', "Can't follow this job any more", result.error, [openButton(job.jobUrl, 'Open the job', false)]),
    )
    return
  }
  const status: JobStatus = result.ok ? result.data.status : 'queued'
  show(
    targetCard(t),
    h('p', { class: 'cx-strong', text: 'Writing your drafts' }),
    stageList(status),
    h('p', { class: 'cx-text-xs cx-muted', text: "You can leave this page. We'll notify you when they're ready." }),
  )
  if (Date.now() - startedAt > POLL_LIMIT_MS) {
    show(
      targetCard(t),
      renderCallout('info', 'Still writing', 'This is taking longer than usual. You will get a notification when the drafts are ready.', [
        openButton(job.jobUrl, 'Open the job', false),
      ]),
    )
    return
  }
  pollTimer = setTimeout(() => void poll(t, job, token, startedAt), POLL_MS)
}

function renderDone(t: Target, job: DraftFromGithubResponse, data: JobResponse): void {
  if (data.status === 'failed' || data.status === 'cancelled' || data.drafts.length === 0) {
    show(
      targetCard(t),
      renderCallout(
        'danger',
        data.status === 'cancelled' ? 'Drafting was cancelled' : "CommitFlex couldn't write these drafts",
        data.errorMessage ?? 'Open the job in CommitFlex to see what happened.',
        [openButton(job.jobUrl, 'Open the job', false)],
      ),
    )
    return
  }
  const drafts = h(
    'ul',
    { class: 'cx-draft-preview' },
    data.drafts.map((draft) => {
      const copy = h(
        'button',
        { class: 'cx-btn cx-btn--ghost cx-btn--xs cx-focus', attrs: { type: 'button' } },
        icon('copy', 14),
        h('span', { text: 'Copy' }),
      )
      copy.addEventListener('click', async () => {
        const ok = await copyText(draft.text)
        const label = copy.querySelector('span')
        if (label) label.textContent = ok ? 'Copied' : "Couldn't copy"
        setTimeout(() => label && (label.textContent = 'Copy'), 1600)
      })
      return h(
        'li',
        {},
        h(
          'div',
          { class: 'cx-item-meta' },
          brandIcon(draft.platform, 12),
          h('span', { class: 'cx-medium', text: platformLabel(draft.platform) }),
          h('span', { class: 'cx-when', text: `${draft.text.length} chars` }),
        ),
        h('p', { class: 'cx-item-text', text: draft.text }),
        h('div', { class: 'cx-item-actions' }, copy),
      )
    }),
  )
  show(
    targetCard(t),
    renderCallout('success', 'Drafts ready', 'Review them in CommitFlex, or copy one now.', [openButton(job.jobUrl)]),
    drafts,
  )
}

/* ------------------------------------------------------------------ startup */

function enable(): void {
  if (enabled) return
  enabled = true
  update()
}

function disable(): void {
  enabled = false
  closePanel()
  overlay?.destroy()
  overlay = null
  launcher = null
  target = null
}

// GitHub navigates with Turbo; re-check the URL and the header as the page renders.
const observer = new MutationObserver(() => {
  if (enabled) scheduleUpdate()
})
let updateQueued = false
function scheduleUpdate(): void {
  if (updateQueued) return
  updateQueued = true
  setTimeout(() => {
    updateQueued = false
    update()
  }, 150)
}

observer.observe(document.documentElement, { childList: true, subtree: true })
document.addEventListener('turbo:load', scheduleUpdate)
window.addEventListener('popstate', scheduleUpdate)
// Catch the "unknown state" grace period ending without any DOM change.
setInterval(() => enabled && scheduleUpdate(), 1500)

void getSettings().then((settings) => (settings.githubButton ? enable() : disable()))
onSettingsChanged((settings) => (settings.githubButton ? enable() : disable()))
