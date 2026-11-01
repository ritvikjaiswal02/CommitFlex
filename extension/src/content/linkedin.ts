/**
 * LinkedIn: the "Start a post" share box (a Quill editor inside the share
 * dialog). Comment and message boxes are left alone.
 */
import { startComposerAssist } from './composer'

const EDITOR_SELECTORS = [
  '.share-creation-state__text-editor .ql-editor[contenteditable="true"]',
  '.share-box .ql-editor[contenteditable="true"]',
  '[role="dialog"] .ql-editor[contenteditable="true"]',
  '[role="dialog"] [contenteditable="true"][role="textbox"][aria-label*="post" i]',
  '[role="dialog"] [contenteditable="true"][role="textbox"][aria-label*="content" i]',
].join(',')

const EXCLUDE = [
  '.comments-comment-box',
  '.comments-comment-texteditor',
  '.msg-form',
  '.msg-overlay-conversation-bubble',
  '[data-test-modal-id="send-invite-modal"]',
].join(',')

function isPostEditor(el: Element): el is HTMLElement {
  return el instanceof HTMLElement && el.isContentEditable && !el.closest(EXCLUDE)
}

startComposerAssist({
  platform: 'linkedin',
  settingKey: 'composerLinkedIn',
  findEditors() {
    return Array.from(document.querySelectorAll(EDITOR_SELECTORS)).filter(isPostEditor)
  },
  editorFor(node) {
    const el = node instanceof Element ? node : node.parentElement
    const editor = el?.closest(EDITOR_SELECTORS)
    return editor && isPostEditor(editor) ? editor : null
  },
})
