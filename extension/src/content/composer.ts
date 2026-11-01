/**
 * Composer assist for LinkedIn and X.
 *
 * When a post composer is on screen, a small CommitFlex button sits in its
 * bottom-right corner. It opens a panel with that platform's queue (ready,
 * scheduled, needs review) and recent drafts. Insert puts the text at the
 * cursor. When the composer closes or empties within two minutes of an
 * insert, we ask whether the post went out and mark it as posted.
 *
 * Alt+Shift+C toggles the panel while a composer is focused.
 */
import { copyText, h, replaceChildren } from '../shared/dom'
import { platformLabel, pluralize } from '../shared/format'
import { icon, logoMark, spinner } from '../shared/icons'
import { sendToBackground, type TabRequest, type TabResponse } from '../shared/messages'
import { getSettings, onSettingsChanged } from '../shared/storage'
import type { ExtensionItem, Platform, PublicState, QueueResponse, Settings } from '../shared/types'
import { renderCallout, renderEmpty, renderItemList, renderListSkeleton } from '../ui/item-list'
import { createOverlay, type Overlay } from './overlay'
import { editorIsEmpty, insertIntoEditor, isVisible, trackSelections } from './insert'

export interface ComposerAdapter {
  platform: Platform
  settingKey: keyof Pick<Settings, 'composerLinkedIn' | 'composerX'>
  /** Post composer editors currently in the DOM, in document order. */
  findEditors(): HTMLElement[]
  /** The composer editor a node sits in, if any. */
  editorFor(node: Node): HTMLElement | null
}

const TRIGGER_SIZE = 30
const TRIGGER_INSET = 6
const POST_WATCH_MS = 2 * 60 * 1000

export function startComposerAssist(adapter: ComposerAdapter): void {
  const label = platformLabel(adapter.platform)
  let enabled = false
  let overlay: Overlay | null = null
  let trigger: HTMLButtonElement | null = null
  let countBadge: HTMLSpanElement | null = null
  let panel: HTMLElement | null = null
  let active: HTMLElement | null = null
  let lastRect = ''
  let resizeObserver: ResizeObserver | null = null
  let readyCount = 0
  let countFetchedAt = 0
  let stopPostWatch: (() => void) | null = null

  /* ------------------------------------------------------------ overlay */

  function ensureOverlay(): Overlay {
    if (overlay && overlay.host.isConnected) return overlay
    overlay = createOverlay(`commitflex-composer-${adapter.platform}`)
    trigger = h(
      'button',
      {
        class: 'cx-trigger cx-focus',
        attrs: {
          type: 'button',
          'aria-label': `CommitFlex: insert a ${label} draft`,
          title: `CommitFlex drafts (Alt+Shift+C)`,
          'aria-haspopup': 'dialog',
          'aria-expanded': 'false',
          hidden: true,
        },
      },
      logoMark(18),
    )
    countBadge = h('span', { class: 'cx-trigger-count cx-tabular', attrs: { hidden: true, 'aria-hidden': 'true' } })
    trigger.appendChild(countBadge)
    // Keep focus (and the caret) in the editor when the trigger is pressed.
    trigger.addEventListener('mousedown', (event) => event.preventDefault())
    trigger.addEventListener('click', () => (panel ? closePanel(true) : openPanel()))
    overlay.root.appendChild(trigger)
    return overlay
  }

  /* -------------------------------------------------------- positioning */

  function position(): void {
    if (!trigger) return
    if (!active || !isVisible(active)) {
      trigger.hidden = true
      lastRect = ''
      return
    }
    const rect = active.getBoundingClientRect()
    const offscreen = rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth
    if (offscreen || rect.width < 120) {
      trigger.hidden = true
      if (panel) closePanel(false)
      return
    }
    let x = rect.right - TRIGGER_SIZE - TRIGGER_INSET
    let y =
      rect.height >= TRIGGER_SIZE + TRIGGER_INSET * 2
        ? rect.bottom - TRIGGER_SIZE - TRIGGER_INSET
        : rect.top + (rect.height - TRIGGER_SIZE) / 2
    x = Math.max(4, Math.min(x, window.innerWidth - TRIGGER_SIZE - 4))
    y = Math.max(4, Math.min(y, window.innerHeight - TRIGGER_SIZE - 4))
    const key = `${Math.round(x)}:${Math.round(y)}`
    trigger.hidden = false
    if (key !== lastRect) {
      lastRect = key
      trigger.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`
      if (panel) placePanel()
    }
  }

  function placePanel(): void {
    if (!panel || !trigger) return
    const t = trigger.getBoundingClientRect()
    const width = Math.min(380, window.innerWidth - 16)
    panel.style.width = `${width}px`
    const height = panel.getBoundingClientRect().height || 320
    let left = t.right - width
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
    let top = t.bottom + 8
    if (top + height > window.innerHeight - 8) top = t.top - 8 - height
    if (top < 8) top = Math.max(8, window.innerHeight - height - 8)
    panel.style.left = `${Math.round(left)}px`
    panel.style.top = `${Math.round(top)}px`
  }

  function setActive(editor: HTMLElement | null): void {
    if (editor === active) return
    resizeObserver?.disconnect()
    active = editor
    lastRect = ''
    if (editor) {
      ensureOverlay()
      resizeObserver = new ResizeObserver(() => position())
      resizeObserver.observe(editor)
      void refreshCount(false)
    } else if (panel) {
      closePanel(false)
    }
    position()
  }

  /* ---------------------------------------------------------- scanning */

  let scanQueued = false
  function scheduleScan(): void {
    if (scanQueued || !enabled) return
    scanQueued = true
    requestAnimationFrame(() => {
      scanQueued = false
      scan()
    })
  }

  function scan(): void {
    if (!enabled) return
    const editors = adapter.findEditors().filter(isVisible)
    if (editors.length === 0) {
      setActive(null)
      return
    }
    const focused = document.activeElement ? adapter.editorFor(document.activeElement) : null
    if (focused && editors.includes(focused)) setActive(focused)
    else if (active && editors.includes(active)) position()
    else setActive(editors[editors.length - 1])
  }

  const mutationObserver = new MutationObserver(scheduleScan)

  /* ------------------------------------------------------------- count */

  async function refreshCount(force: boolean): Promise<void> {
    if (!force && Date.now() - countFetchedAt < 30_000) return
    countFetchedAt = Date.now()
    const result = await sendToBackground({ type: 'queue:get', platform: adapter.platform, force })
    readyCount = result.ok ? (result.data.counts?.ready ?? result.data.queue.filter((i) => i.status === 'ready').length) : 0
    if (countBadge) {
      countBadge.hidden = readyCount === 0
      countBadge.textContent = readyCount > 9 ? '9+' : String(readyCount)
    }
    if (trigger) {
      trigger.setAttribute(
        'aria-label',
        readyCount > 0
          ? `CommitFlex: ${pluralize(readyCount, 'post')} ready for ${label}`
          : `CommitFlex: insert a ${label} draft`,
      )
    }
  }

  /* ------------------------------------------------------------- panel */

  function openPanel(): void {
    if (!active) return
    const o = ensureOverlay()
    panel = h('div', {
      class: 'cx-panel',
      attrs: { role: 'dialog', 'aria-label': `CommitFlex drafts for ${label}`, tabindex: '-1' },
    })
    panel.addEventListener('mousedown', (event) => {
      // Buttons shouldn't steal the caret from the composer.
      const target = event.target as HTMLElement
      if (target.closest('button')) event.preventDefault()
    })
    panel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        closePanel(true)
      }
    })
    o.root.appendChild(panel)
    trigger?.setAttribute('aria-expanded', 'true')
    void renderPanel(false)
    placePanel()
    panel.focus({ preventScroll: true })
    document.addEventListener('pointerdown', onOutsidePointer, true)
  }

  function closePanel(refocusEditor: boolean): void {
    document.removeEventListener('pointerdown', onOutsidePointer, true)
    panel?.remove()
    panel = null
    trigger?.setAttribute('aria-expanded', 'false')
    if (refocusEditor && active?.isConnected) active.focus({ preventScroll: true })
  }

  function onOutsidePointer(event: PointerEvent): void {
    if (!overlay) return
    if (event.composedPath().includes(overlay.host)) return
    closePanel(false)
  }

  function panelHead(onRefresh: (() => void) | null, refreshing: boolean): HTMLElement {
    const refresh = onRefresh
      ? h(
          'button',
          {
            class: 'cx-btn cx-btn--ghost cx-btn--xs cx-btn--icon cx-focus',
            attrs: { type: 'button', 'aria-label': 'Refresh', title: 'Refresh', 'aria-busy': refreshing ? 'true' : null },
            on: { click: onRefresh },
          },
          refreshing ? spinner(14) : icon('refresh', 14),
        )
      : null
    return h(
      'div',
      { class: 'cx-panel-head' },
      h('div', { class: 'cx-panel-title' }, logoMark(18), h('span', { text: 'CommitFlex' }), h('span', { class: 'cx-badge', text: label })),
      h('span', { class: 'cx-spacer' }),
      refresh,
      h(
        'button',
        {
          class: 'cx-btn cx-btn--ghost cx-btn--xs cx-btn--icon cx-focus',
          attrs: { type: 'button', 'aria-label': 'Close' },
          on: { click: () => closePanel(true) },
        },
        icon('x', 14),
      ),
    )
  }

  function panelFoot(): HTMLElement {
    return h(
      'div',
      { class: 'cx-panel-foot' },
      h(
        'span',
        { class: 'cx-hint' },
        h('kbd', { class: 'cx-kbd', text: 'Alt' }),
        h('kbd', { class: 'cx-kbd', text: 'Shift' }),
        h('kbd', { class: 'cx-kbd', text: 'C' }),
        h('span', { text: 'opens this panel' }),
      ),
      h('button', {
        class: 'cx-btn cx-btn--link cx-btn--xs cx-focus',
        attrs: { type: 'button' },
        text: 'Open queue',
        on: { click: () => void sendToBackground({ type: 'open:app', path: '/queue' }) },
      }),
    )
  }

  async function renderPanel(force: boolean): Promise<void> {
    const current = panel
    if (!current) return
    const body = h('div', { class: 'cx-panel-body' }, renderListSkeleton(3))
    replaceChildren(current, panelHead(null, true), body, panelFoot())
    placePanel()

    const stateResult = await sendToBackground({ type: 'state:get' })
    if (panel !== current) return
    const state: PublicState | null = stateResult.ok ? stateResult.data : null

    if (!state || !state.connected) {
      replaceChildren(current, panelHead(null, false), h('div', { class: 'cx-panel-body' }, notConnected(state)), panelFoot())
      placePanel()
      return
    }

    const result = await sendToBackground({ type: 'queue:get', platform: adapter.platform, force })
    if (panel !== current) return
    const refresh = () => void renderPanel(true)

    if (!result.ok) {
      replaceChildren(
        current,
        panelHead(refresh, false),
        h(
          'div',
          { class: 'cx-panel-body' },
          renderCallout('danger', "Your queue didn't load", result.error, [
            h('button', { class: 'cx-btn cx-btn--secondary cx-btn--xs cx-focus', attrs: { type: 'button' }, text: 'Try again', on: { click: refresh } }),
          ]),
        ),
        panelFoot(),
      )
      placePanel()
      return
    }

    replaceChildren(current, panelHead(refresh, false), h('div', { class: 'cx-panel-body' }, queueView(result.data, !!result.data.stale)), panelFoot())
    placePanel()
  }

  function notConnected(state: PublicState | null): HTMLElement {
    const connect = h('button', {
      class: 'cx-btn cx-btn--primary cx-btn--xs cx-focus',
      attrs: { type: 'button' },
      text: state?.invalid ? 'Connect again' : 'Connect CommitFlex',
      on: { click: () => void sendToBackground({ type: 'open:app', path: '/extension' }) },
    })
    const paste = h('button', {
      class: 'cx-btn cx-btn--ghost cx-btn--xs cx-focus',
      attrs: { type: 'button' },
      text: 'Paste a token',
      on: { click: () => void sendToBackground({ type: 'open:options' }) },
    })
    return state?.invalid
      ? renderCallout('warning', 'Your extension token stopped working', 'It was revoked or has expired. Connect the extension again from CommitFlex.', [connect, paste])
      : renderCallout('info', 'Connect your CommitFlex account', `Your ${label} drafts show up here once the extension is connected.`, [connect, paste])
  }

  function queueView(data: QueueResponse, stale: boolean): HTMLElement {
    const list = renderItemList({
      queue: data.queue,
      recent: data.recent,
      showPlatform: false,
      canInsert: true,
      onInsert: (item) => insertItem(item),
      onApprove: (item) => approveItem(item),
      onOpen: (item) => void sendToBackground({ type: 'open:url', url: item.appUrl }),
      empty: () =>
        renderEmpty(
          `Nothing queued for ${label}`,
          'Merge a pull request, publish a release, or draft a post in CommitFlex.',
          h('button', {
            class: 'cx-btn cx-btn--secondary cx-btn--xs cx-focus',
            attrs: { type: 'button' },
            text: 'Draft a post',
            on: { click: () => void sendToBackground({ type: 'open:app', path: '/drafts/new' }) },
          }),
        ),
    })
    if (!stale) return list
    return h(
      'div',
      {},
      renderCallout('warning', 'Showing your last saved queue', "CommitFlex couldn't be reached just now."),
      list,
    )
  }

  /* ------------------------------------------------------------ approve */

  async function approveItem(item: ExtensionItem): Promise<boolean> {
    const result = await sendToBackground({ type: 'draft:approve', draftId: item.draftId })
    if (!result.ok) {
      ensureOverlay().toast({ title: "Couldn't approve it", body: result.error, tone: 'danger', duration: 8000 })
      return false
    }
    void refreshCount(true)
    return true
  }

  /* ------------------------------------------------------------ insert */

  async function insertItem(item: ExtensionItem): Promise<boolean> {
    const editor = active
    if (!editor || !editor.isConnected) {
      overlay?.toast({ title: 'The composer closed', body: `Open a new ${label} post and try again.`, tone: 'danger' })
      return false
    }
    const ok = await insertIntoEditor(editor, item.text)
    if (ok) {
      closePanel(false)
      watchForPost(item, editor)
      return true
    }
    const copied = await copyText(item.text)
    overlay?.toast({
      title: copied ? 'Copied instead' : "The composer didn't accept the text",
      body: copied
        ? `${label} didn't take the text directly. Press Ctrl+V (Cmd+V on a Mac) in the composer to paste it.`
        : 'Use Copy in the panel, then paste it into the composer.',
      tone: copied ? 'default' : 'danger',
      duration: 8000,
    })
    if (copied) watchForPost(item, editor)
    return false
  }

  function watchForPost(item: ExtensionItem, editor: HTMLElement): void {
    stopPostWatch?.()
    const started = Date.now()
    let sawText = !editorIsEmpty(editor)
    const timer = setInterval(() => {
      if (Date.now() - started > POST_WATCH_MS) {
        stop()
        return
      }
      const gone = !editor.isConnected || !isVisible(editor)
      const empty = !gone && editorIsEmpty(editor)
      if (!sawText && !gone && !empty) sawText = true
      if (gone || (sawText && empty)) {
        stop()
        void confirmPosted(item)
      }
    }, 1000)
    function stop() {
      clearInterval(timer)
      if (stopPostWatch === stop) stopPostWatch = null
    }
    stopPostWatch = stop
  }

  /** First words of the post, whitespace collapsed: what we look for in the feed. */
  function fingerprint(text: string): string {
    return text.replace(/\s+/g, ' ').trim().slice(0, 60).toLowerCase()
  }

  function pageShows(snippet: string): boolean {
    if (snippet.length < 12) return false
    const body = document.body?.innerText ?? ''
    return body.replace(/\s+/g, ' ').toLowerCase().includes(snippet)
  }

  /**
   * The composer closed. If the post shows up in the page within a few
   * seconds (the feed or timeline renders it), it went out: mark it posted
   * automatically and offer Undo. Otherwise the user may have discarded it,
   * so ask instead of guessing.
   */
  async function confirmPosted(item: ExtensionItem): Promise<void> {
    const snippet = fingerprint(item.text)
    const deadline = Date.now() + 12_000
    while (Date.now() < deadline) {
      if (pageShows(snippet)) {
        await autoMarkPosted(item)
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
    askPosted(item)
  }

  async function autoMarkPosted(item: ExtensionItem): Promise<void> {
    const o = ensureOverlay()
    const result = await sendToBackground({ type: 'draft:posted', draftId: item.draftId })
    if (!result.ok) {
      askPosted(item)
      return
    }
    void refreshCount(true)
    const dismiss = o.toast({
      title: 'Marked as posted',
      body: `CommitFlex saw your ${label} post go out and took it off your queue.`,
      tone: 'success',
      duration: 10_000,
      actions: [
        {
          label: 'Undo',
          onClick: async () => {
            dismiss()
            const undo = await sendToBackground({ type: 'draft:unposted', draftId: item.draftId })
            if (undo.ok) {
              o.toast({ title: 'Back in your queue', body: 'It is marked ready to post again.' })
              void refreshCount(true)
            } else {
              o.toast({ title: "Couldn't undo", body: undo.error, tone: 'danger', duration: 8000 })
            }
          },
        },
      ],
    })
  }

  function askPosted(item: ExtensionItem): void {
    const o = ensureOverlay()
    const dismiss = o.toast({
      title: `Did your ${label} post go out?`,
      body: 'Mark it as posted so CommitFlex takes it off your queue.',
      duration: 60_000,
      actions: [
        {
          label: 'Mark as posted',
          variant: 'primary',
          onClick: async () => {
            const result = await sendToBackground({ type: 'draft:posted', draftId: item.draftId })
            dismiss()
            if (result.ok) {
              o.toast({ title: 'Marked as posted', tone: 'success' })
              void refreshCount(true)
            } else {
              o.toast({ title: "Couldn't mark it as posted", body: result.error, tone: 'danger', duration: 8000 })
            }
          },
        },
        { label: 'Not yet', onClick: () => dismiss() },
      ],
    })
  }

  /* ---------------------------------------------------- popup messages */

  chrome.runtime.onMessage.addListener((request: TabRequest, sender, sendResponse: (r: TabResponse) => void) => {
    if (sender.id !== chrome.runtime.id) return false
    if (request.type === 'composer:probe') {
      scan()
      sendResponse({ ok: true, platform: adapter.platform, hasComposer: !!active && enabled })
      return false
    }
    if (request.type === 'composer:insert') {
      if (request.platform !== adapter.platform) {
        sendResponse({ ok: false, reason: 'wrong_platform', platform: adapter.platform })
        return false
      }
      scan()
      const editor = active
      if (!editor) {
        sendResponse({ ok: false, reason: 'no_composer', platform: adapter.platform })
        return false
      }
      const item = { draftId: request.draftId, text: request.text } as ExtensionItem
      void insertIntoEditor(editor, request.text).then((ok) => {
        if (ok) watchForPost(item, editor)
        sendResponse(ok ? { ok: true, platform: adapter.platform, hasComposer: true } : { ok: false, reason: 'insert_failed', platform: adapter.platform })
      })
      return true
    }
    return false
  })

  /* ----------------------------------------------------------- startup */

  function onKeydown(event: KeyboardEvent): void {
    if (!enabled || !event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey || event.code !== 'KeyC') return
    const editor = document.activeElement ? adapter.editorFor(document.activeElement) : null
    if (!editor && !panel) return
    event.preventDefault()
    event.stopPropagation()
    if (editor) setActive(editor)
    if (panel) closePanel(true)
    else openPanel()
  }

  const onViewportChange = () => position()

  function enable(): void {
    if (enabled) return
    enabled = true
    mutationObserver.observe(document.documentElement, { childList: true, subtree: true })
    window.addEventListener('scroll', onViewportChange, { capture: true, passive: true })
    window.addEventListener('resize', onViewportChange, { passive: true })
    document.addEventListener('focusin', scheduleScan, true)
    document.addEventListener('keydown', onKeydown, true)
    scan()
  }

  function disable(): void {
    if (!enabled) return
    enabled = false
    mutationObserver.disconnect()
    window.removeEventListener('scroll', onViewportChange, { capture: true })
    window.removeEventListener('resize', onViewportChange)
    document.removeEventListener('focusin', scheduleScan, true)
    document.removeEventListener('keydown', onKeydown, true)
    closePanel(false)
    setActive(null)
    resizeObserver?.disconnect()
    overlay?.destroy()
    overlay = null
    trigger = null
    countBadge = null
  }

  trackSelections((node) => adapter.editorFor(node))

  void getSettings().then((settings) => (settings[adapter.settingKey] ? enable() : disable()))
  onSettingsChanged((settings) => (settings[adapter.settingKey] ? enable() : disable()))
  // Layout shifts that neither scroll nor resize (sidebars, banners).
  setInterval(() => {
    if (enabled && active) position()
  }, 750)
}
