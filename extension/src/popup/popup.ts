/**
 * Toolbar popup: the queue with Copy, Insert into the open tab and Open in
 * CommitFlex. Not connected yet: how to connect, plus a paste-a-token form.
 */
import { h, replaceChildren } from '../shared/dom'
import { platformLabel } from '../shared/format'
import { brandIcon, icon, logoMark, spinner } from '../shared/icons'
import { sendToBackground, type TabResponse } from '../shared/messages'
import type { ExtensionItem, Platform, PublicState, QueueResponse } from '../shared/types'
import { renderCallout, renderEmpty, renderItemList, renderListSkeleton } from '../ui/item-list'
import { applyExtensionTheme } from '../ui/theme'

type Filter = 'all' | Platform

const app = document.getElementById('app') as HTMLElement
let state: PublicState | null = null
let filter: Filter = 'all'
let tab: { id: number; platform: Platform | null } | null = null
let banner: HTMLElement | null = null

applyExtensionTheme()

/* ------------------------------------------------------------- active tab */

function platformOf(url: string | undefined): Platform | null {
  if (!url) return null
  try {
    const host = new URL(url).hostname
    if (host === 'www.linkedin.com' || host === 'linkedin.com') return 'linkedin'
    if (host === 'x.com' || host === 'twitter.com' || host.endsWith('.x.com')) return 'twitter'
  } catch {
    return null
  }
  return null
}

async function readActiveTab(): Promise<void> {
  try {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (active?.id) tab = { id: active.id, platform: platformOf(active.url) }
  } catch {
    tab = null
  }
}

/* ------------------------------------------------------------------ shell */

function header(): HTMLElement {
  const plan = state?.plan
  const planText = plan ? (plan.status === 'trialing' ? 'Pro trial' : plan.name) : null
  return h(
    'header',
    { class: 'cx-popup-head' },
    h('div', { class: 'cx-popup-brand' }, logoMark(20), h('span', { text: 'CommitFlex' })),
    planText ? h('span', { class: `cx-badge ${plan?.id === 'free' ? '' : 'cx-badge--accent'}`, text: planText }) : null,
    h('span', { class: 'cx-spacer' }),
    state?.connected
      ? h(
          'button',
          {
            class: 'cx-btn cx-btn--ghost cx-btn--icon cx-focus',
            attrs: { type: 'button', 'aria-label': 'Refresh', title: 'Refresh' },
            on: { click: () => void loadQueue(true) },
          },
          icon('refresh', 16),
        )
      : null,
    h(
      'button',
      {
        class: 'cx-btn cx-btn--ghost cx-btn--icon cx-focus',
        attrs: { type: 'button', 'aria-label': 'Settings', title: 'Settings' },
        on: { click: () => void chrome.runtime.openOptionsPage() },
      },
      icon('settings', 16),
    ),
  )
}

/* --------------------------------------------------------- not connected */

function renderConnect(): void {
  const invalid = !!state?.invalid
  const tokenInput = h('input', {
    class: 'cx-input cx-mono',
    attrs: {
      type: 'password',
      placeholder: 'cfx_…',
      'aria-label': 'Extension token',
      autocomplete: 'off',
      spellcheck: 'false',
    },
  })
  const error = h('p', { class: 'cx-error-text', attrs: { role: 'alert', hidden: true } })
  const submit = h('button', { class: 'cx-btn cx-btn--secondary cx-btn--md cx-focus', attrs: { type: 'submit' }, text: 'Connect' })
  const form = h('form', { class: 'cx-field', attrs: { novalidate: true } }, h('div', { class: 'cx-token-form' }, tokenInput, submit), error)
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const token = tokenInput.value.trim()
    if (!token) {
      error.hidden = false
      error.textContent = 'Paste the token you created in CommitFlex.'
      tokenInput.setAttribute('aria-invalid', 'true')
      return
    }
    submit.setAttribute('aria-disabled', 'true')
    replaceChildren(submit, spinner(16))
    const appUrl = state?.appUrl ?? ''
    const result = await sendToBackground({ type: 'auth:connect', token, appUrl })
    submit.removeAttribute('aria-disabled')
    replaceChildren(submit, 'Connect')
    if (!result.ok) {
      error.hidden = false
      error.textContent = result.error
      tokenInput.setAttribute('aria-invalid', 'true')
      return
    }
    state = result.data
    await render()
  })

  replaceChildren(
    app,
    header(),
    h(
      'div',
      { class: 'cx-connect' },
      invalid
        ? renderCallout('warning', 'Your extension token stopped working', 'It was revoked or has expired. Connect again to see your queue.')
        : null,
      h(
        'div',
        {},
        h('h1', { class: 'cx-connect-title', text: invalid ? 'Connect again' : 'Connect your account' }),
        h('p', { class: 'cx-muted', text: 'Your queue shows up here and inside the LinkedIn and X composers.' }),
      ),
      h(
        'ol',
        { class: 'cx-connect-steps' },
        h('li', { text: 'Open the Extension page in CommitFlex.' }),
        h('li', { text: 'Choose Connect extension. The token is handed over for you.' }),
      ),
      h(
        'button',
        {
          class: 'cx-btn cx-btn--primary cx-btn--md cx-btn--block cx-focus',
          attrs: { type: 'button' },
          on: {
            click: () => {
              void sendToBackground({ type: 'open:app', path: '/extension' })
              window.close()
            },
          },
        },
        h('span', { text: 'Open CommitFlex' }),
        icon('externalLink', 16),
      ),
      h('div', { class: 'cx-divider', text: 'or paste a token' }),
      form,
    ),
  )
}

/* -------------------------------------------------------------- the queue */

function filterControl(counts: Record<Filter, number>): HTMLElement {
  const options: { value: Filter; label: string; mark?: Element }[] = [
    { value: 'all', label: 'All' },
    { value: 'linkedin', label: 'LinkedIn', mark: brandIcon('linkedin', 12) },
    { value: 'twitter', label: 'X', mark: brandIcon('twitter', 12) },
  ]
  return h(
    'div',
    { class: 'cx-segmented', attrs: { role: 'group', 'aria-label': 'Platform' } },
    options.map((option) =>
      h(
        'button',
        {
          class: 'cx-focus',
          attrs: { type: 'button', 'aria-pressed': filter === option.value ? 'true' : 'false' },
          on: {
            click: () => {
              if (filter === option.value) return
              filter = option.value
              void loadQueue(false)
            },
          },
        },
        option.mark ?? null,
        h('span', { text: option.label }),
        counts[option.value] > 0
          ? h('span', { class: 'cx-count cx-tabular', text: String(counts[option.value]), attrs: { 'aria-label': `${counts[option.value]} ready` } })
          : null,
      ),
    ),
  )
}

function footer(): HTMLElement {
  const usage = state?.usage?.generations
  const ratio = usage && usage.max > 0 ? Math.min(1, usage.used / usage.max) : 0
  const tone = usage && usage.max > 0 && usage.used >= usage.max ? 'danger' : ratio >= 0.8 ? 'warning' : 'accent'
  return h(
    'footer',
    { class: 'cx-popup-foot' },
    usage
      ? h(
          'div',
          { class: 'cx-usage-row' },
          h('span', { class: 'cx-tabular', text: `${usage.used} of ${usage.max} drafts this month` }),
          h('button', {
            class: 'cx-btn cx-btn--link cx-btn--xs cx-focus',
            attrs: { type: 'button' },
            text: 'Open queue',
            on: {
              click: () => {
                void sendToBackground({ type: 'open:app', path: '/queue' })
                window.close()
              },
            },
          }),
        )
      : null,
    usage
      ? h(
          'div',
          { class: 'cx-meter', dataset: { tone }, attrs: { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': usage.max, 'aria-valuenow': usage.used, 'aria-label': 'Drafts used this month' } },
          h('span', { style: { width: `${Math.round(ratio * 100)}%` } }),
        )
      : null,
  )
}

function readyCounts(all: QueueResponse | null): Record<Filter, number> {
  const items = all?.queue ?? []
  const ready = items.filter((i) => i.status === 'ready')
  return {
    all: ready.length,
    linkedin: ready.filter((i) => i.platform === 'linkedin').length,
    twitter: ready.filter((i) => i.platform === 'twitter').length,
  }
}

/** Insert is offered for posts that match the open tab's platform; a closed composer gets a clear message. */
function canInsert(item: ExtensionItem): boolean {
  return !!tab && tab.platform === item.platform
}

async function insert(item: ExtensionItem): Promise<boolean> {
  banner?.remove()
  banner = null
  if (!tab) return false
  try {
    const response = (await chrome.tabs.sendMessage(tab.id, {
      type: 'composer:insert',
      text: item.text,
      draftId: item.draftId,
      platform: item.platform,
    })) as TabResponse | undefined
    if (response?.ok) {
      window.close()
      return true
    }
    showBanner(
      response && !response.ok && response.reason === 'insert_failed'
        ? `${platformLabel(item.platform)} didn't accept the text. Use Copy, then paste it into the composer.`
        : `Open the ${platformLabel(item.platform)} post composer in this tab, then try again.`,
    )
  } catch {
    showBanner(`Reload the ${platformLabel(item.platform)} tab, open its post composer, then try again.`)
  }
  return false
}

function showBanner(message: string): void {
  const body = app.querySelector('.cx-popup-body')
  if (!body) return
  banner = renderCallout('warning', "Couldn't insert the post", message)
  banner.classList.add('cx-banner')
  body.prepend(banner)
}

let loadToken = 0

async function loadQueue(force: boolean): Promise<void> {
  const token = ++loadToken
  const body = h('div', { class: 'cx-popup-body' }, renderListSkeleton(3))
  const allResult = filter === 'all' ? null : await sendToBackground({ type: 'queue:get' })
  const counts = readyCounts(allResult?.ok ? allResult.data : null)
  replaceChildren(app, header(), h('div', { class: 'cx-popup-toolbar' }, filterControl(counts)), body, footer())

  const result = await sendToBackground({ type: 'queue:get', platform: filter === 'all' ? undefined : filter, force })
  if (token !== loadToken) return

  if (!result.ok) {
    if (result.status === 401) {
      const refreshed = await sendToBackground({ type: 'state:get' })
      if (refreshed.ok) state = refreshed.data
      renderConnect()
      return
    }
    replaceChildren(
      body,
      renderCallout('danger', "Your queue didn't load", result.error, [
        h('button', {
          class: 'cx-btn cx-btn--secondary cx-btn--xs cx-focus',
          attrs: { type: 'button' },
          text: 'Try again',
          on: { click: () => void loadQueue(true) },
        }),
      ]),
    )
    return
  }

  if (filter === 'all') {
    const toolbar = app.querySelector('.cx-popup-toolbar')
    if (toolbar) replaceChildren(toolbar, filterControl(readyCounts(result.data)))
  }

  const list = renderItemList({
    queue: result.data.queue,
    recent: result.data.recent,
    showPlatform: filter === 'all',
    canInsert,
    onInsert: insert,
    onApprove: async (item) => {
      const result = await sendToBackground({ type: 'draft:approve', draftId: item.draftId })
      if (!result.ok) {
        replaceChildren(body, renderCallout('danger', "Couldn't approve it", result.error))
        return false
      }
      window.setTimeout(() => void loadQueue(true), 900)
      return true
    },
    onOpen: (item) => {
      void sendToBackground({ type: 'open:url', url: item.appUrl })
      window.close()
    },
    empty: () =>
      renderEmpty(
        filter === 'all' ? 'Your queue is empty' : `Nothing queued for ${platformLabel(filter)}`,
        'Merge a pull request, publish a release, or draft a post in CommitFlex.',
        h('button', {
          class: 'cx-btn cx-btn--secondary cx-btn--xs cx-focus',
          attrs: { type: 'button' },
          text: 'Draft a post',
          on: {
            click: () => {
              void sendToBackground({ type: 'open:app', path: '/drafts/new' })
              window.close()
            },
          },
        }),
      ),
  })
  replaceChildren(
    body,
    result.data.stale ? renderCallout('warning', 'Showing your last saved queue', "CommitFlex couldn't be reached just now.") : null,
    list,
  )
}

/* -------------------------------------------------------------- startup */

async function render(): Promise<void> {
  if (!state?.connected) {
    renderConnect()
    return
  }
  await loadQueue(false)
  // Pick up plan and usage changes in the background.
  void sendToBackground({ type: 'auth:refresh' }).then((result) => {
    if (!result.ok) return
    state = result.data
    const head = app.querySelector('.cx-popup-head')
    if (head) head.replaceWith(header())
    const foot = app.querySelector('.cx-popup-foot')
    if (foot) foot.replaceWith(footer())
  })
}

async function init(): Promise<void> {
  replaceChildren(app, header(), h('div', { class: 'cx-popup-body' }, renderListSkeleton(3)))
  const [result] = await Promise.all([sendToBackground({ type: 'state:get' }), readActiveTab()])
  state = result.ok ? result.data : null
  if (tab?.platform) filter = tab.platform
  await render()
}

void init()
