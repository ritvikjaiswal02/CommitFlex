/**
 * X (and twitter.com): the post composer, inline on Home and in the compose
 * dialog. Only the first box of a thread is targeted. Reply boxes use the
 * same editor, so the button appears there too, which is harmless: it only
 * inserts text when asked.
 */
import { startComposerAssist } from './composer'

const EDITOR_SELECTOR = '[data-testid="tweetTextarea_0"][contenteditable="true"], [data-testid="tweetTextarea_0"] [contenteditable="true"]'

function resolve(el: Element): HTMLElement | null {
  const editor = el.matches('[contenteditable="true"]') ? el : el.querySelector('[contenteditable="true"]')
  return editor instanceof HTMLElement && editor.isContentEditable ? editor : null
}

startComposerAssist({
  platform: 'twitter',
  settingKey: 'composerX',
  findEditors() {
    const found = new Set<HTMLElement>()
    document.querySelectorAll('[data-testid="tweetTextarea_0"]').forEach((el) => {
      const editor = resolve(el)
      if (editor) found.add(editor)
    })
    return Array.from(found)
  },
  editorFor(node) {
    const el = node instanceof Element ? node : node.parentElement
    const match = el?.closest(EDITOR_SELECTOR) ?? el?.closest('[data-testid="tweetTextarea_0"]')
    return match ? resolve(match) : null
  },
})
