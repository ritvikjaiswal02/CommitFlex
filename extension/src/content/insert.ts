/**
 * Inserting text into rich composers.
 *
 * LinkedIn (Quill) and X (Draft.js) keep their own document model, so writing
 * to the DOM directly is undone on the next render. Both handle paste events,
 * so we first dispatch a synthetic paste carrying the text. If the editor
 * doesn't take it, we fall back to execCommand('insertText'), which goes
 * through the browser's input pipeline like typing does.
 */
import { normalizeText } from '../shared/format'

/** Selections inside each editor, remembered so Insert lands where the cursor was. */
const savedRanges = new WeakMap<HTMLElement, Range>()

/** Call once per page: remembers the last caret position inside any tracked editor. */
export function trackSelections(isEditor: (node: Node) => HTMLElement | null): void {
  document.addEventListener(
    'selectionchange',
    () => {
      const selection = document.getSelection()
      if (!selection || selection.rangeCount === 0) return
      const range = selection.getRangeAt(0)
      const editor = isEditor(range.startContainer)
      if (editor) savedRanges.set(editor, range.cloneRange())
    },
    { passive: true },
  )
}

function placeCaret(editor: HTMLElement): void {
  const selection = document.getSelection()
  if (!selection) return
  const saved = savedRanges.get(editor)
  if (saved && editor.contains(saved.startContainer) && editor.contains(saved.endContainer)) {
    selection.removeAllRanges()
    selection.addRange(saved)
    return
  }
  const range = document.createRange()
  range.selectNodeContents(editor)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

function editorText(editor: HTMLElement): string {
  return normalizeText(editor.innerText || editor.textContent || '')
}

/** A short, distinctive slice of the inserted text to look for afterwards. */
function probeFor(text: string): string {
  const normalized = normalizeText(text)
  return normalized.slice(0, Math.min(32, normalized.length))
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function appeared(editor: HTMLElement, probe: string, before: string, timeoutMs: number): Promise<boolean> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const now = editorText(editor)
    if (now !== before && now.includes(probe)) return true
    await wait(40)
  }
  const now = editorText(editor)
  return now !== before && now.includes(probe)
}

/** Inserts `text` at the caret (or the end) of a contenteditable editor. Resolves true when it landed. */
export async function insertIntoEditor(editor: HTMLElement, text: string): Promise<boolean> {
  if (!editor.isConnected) return false
  const probe = probeFor(text)
  if (!probe) return false

  editor.focus({ preventScroll: true })
  placeCaret(editor)
  const before = editorText(editor)

  // 1. Synthetic paste: handled by Quill and Draft.js, keeps their models in sync.
  let handled = false
  try {
    const data = new DataTransfer()
    data.setData('text/plain', text)
    const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true, composed: true })
    editor.dispatchEvent(event)
    handled = event.defaultPrevented
  } catch {
    handled = false
  }
  if (handled && (await appeared(editor, probe, before, 600))) return true

  // 2. The browser's own insertion, as if typed. Only if the paste left no trace,
  //    so the text can't land twice.
  if (editorText(editor) === before) {
    editor.focus({ preventScroll: true })
    placeCaret(editor)
    try {
      document.execCommand('insertText', false, text)
    } catch {
      // fall through
    }
    if (await appeared(editor, probe, before, 600)) return true
  }

  return editorText(editor).includes(probe)
}

export function isVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false
  const rect = el.getBoundingClientRect()
  if (rect.width < 2 || rect.height < 2) return false
  const style = getComputedStyle(el)
  return style.visibility !== 'hidden' && style.display !== 'none'
}

export function editorIsEmpty(editor: HTMLElement): boolean {
  return editorText(editor).length === 0
}
