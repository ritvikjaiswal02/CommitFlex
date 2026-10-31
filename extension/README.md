# CommitFlex Chrome extension

A Manifest V3 extension that brings your CommitFlex queue into the places you post from.

- **LinkedIn and X composers.** When a post composer is open, a CommitFlex button sits in its bottom-right corner. It lists that platform's posts that are ready, scheduled or waiting for review, plus recent drafts. **Insert** puts the text at your cursor. When the composer closes or empties within two minutes, the extension asks whether the post went out and marks it as posted. `Alt+Shift+C` opens the panel from inside a composer.
- **GitHub.** Merged pull requests and release pages get a **Draft a post** button. It starts a CommitFlex job for that PR or release, shows progress, lists the drafts, and sends a "Drafts ready" notification that opens the job.
- **Toolbar popup.** Your queue, filtered to the platform of the current tab, with Copy, Insert into the open tab and Open in CommitFlex. The badge counts posts that are ready to post. `Alt+Shift+K` opens the popup.

The extension talks only to your CommitFlex instance, using a personal access token (`cfx_…`). It reads nothing from LinkedIn, X or GitHub beyond the composer it writes into and the URL and title of the PR or release you draft from.

## Build

The source is TypeScript in `src/`. `build.mjs` bundles it with esbuild (already a dev dependency of the app) and writes an unpacked extension to `extension/dist`. Icons are drawn by the build script, so the repo holds no binary assets.

```bash
pnpm ext:build                     # extension/dist for http://localhost:3000
pnpm ext:zip                       # extension/commitflex-extension-<version>.zip

# Point it at your deployment. The first URL becomes the default address;
# every listed origin can hand the extension a token from its /extension page.
COMMITFLEX_APP_URL=https://commitflex.app pnpm ext:zip
node extension/build.mjs --app-url=https://commitflex.app,http://localhost:3000

node extension/build.mjs --watch   # rebuild on change while developing
```

Type-check the extension on its own (it has its own `tsconfig.json`, excluded from the app's):

```bash
pnpm exec tsc -p extension/tsconfig.json
```

## Load it unpacked

1. Run `pnpm ext:build`.
2. Open `chrome://extensions` and switch on **Developer mode** (top right).
3. Choose **Load unpacked** and select the `extension/dist` folder.
4. Chrome opens CommitFlex's **Extension** page. Sign in if asked, then choose **Connect extension**. The page creates a token and hands it to the extension; there's nothing to copy.

After changing the source, run the build again and press the reload icon on the CommitFlex card in `chrome://extensions`. Reload any LinkedIn, X or GitHub tabs so they pick up the new content scripts.

Works in Chrome 116 or later, and in other Chromium browsers (Edge, Brave, Arc).

## Connecting without the page

If the Extension page can't reach the extension (for example on another computer), create a token by hand on the Extension page under **Tokens**, open the extension's settings, paste it under **Account** and choose **Save**. Tokens are shown once; revoke one at any time to sign that browser out.

## Publishing to the Chrome Web Store

1. Set the production address and pack: `COMMITFLEX_APP_URL=https://your-domain pnpm ext:zip`.
2. Upload `extension/commitflex-extension-<version>.zip` in the Chrome Web Store developer dashboard.
3. Set `NEXT_PUBLIC_CHROME_EXTENSION_URL` in the app to the listing URL. The Extension page then shows **Add to Chrome** instead of the load-unpacked steps.
4. Bump `version` in `extension/manifest.json` for every upload.

Permissions requested, and why:

| Permission | Why |
|---|---|
| `storage` | The token, the account it belongs to and your settings |
| `alarms` | Refresh the badge every 10 minutes and follow jobs started from GitHub |
| `notifications` | The "Drafts ready" notification |
| `scripting` | Register the connect bridge for a self-hosted CommitFlex address set in settings |
| `clipboardWrite` | Copy buttons |
| Host access to linkedin.com, x.com, twitter.com, github.com | The composer button and the GitHub button |
| Host access to your CommitFlex address | API calls and the connect bridge on the Extension page |
| Optional host access | Only requested if you change the CommitFlex address in settings |

## How it fits together

```
src/
  background.ts         service worker: token, API calls, badge, job notifications
  content/bridge.ts     runs on the CommitFlex app; the /extension page hands over a token
  content/composer.ts   shared LinkedIn/X composer button, panel, insert and "did it post?"
  content/linkedin.ts   LinkedIn share-box adapter
  content/x.ts          X composer adapter
  content/github.ts     "Draft a post" on merged PRs and releases
  content/insert.ts     inserting text into Quill and Draft.js editors
  content/overlay.ts    shadow-DOM overlay, theme detection and toasts
  popup/                toolbar popup
  options/              settings page
  ui/                   queue list, callouts, theme helper
  shared/               API client, storage, messages, icons, formatting
  styles/               design tokens and components (mirrors the app's tokens)
```

API endpoints the extension uses (all `Authorization: Bearer cfx_…`, CORS-enabled, no cookies):

| Endpoint | Used for |
|---|---|
| `GET /api/extension/whoami` | Verify a token, show the account, plan and usage |
| `GET /api/extension/queue?platform=` | Ready, scheduled and waiting items, plus recent drafts |
| `POST /api/extension/drafts/:draftId/posted` | Mark a draft as posted from the extension |
| `POST /api/extension/draft-from-github` | Start a job from a PR, release or repository URL |
| `GET /api/extension/jobs/:jobId` | Job progress and drafts |

The page-to-extension handshake is a `window.postMessage` protocol defined in `app/extension/_components/bridge-protocol.ts` and implemented in `src/content/bridge.ts`. The bridge only accepts messages from its own page, and the token is always stored for the origin of the page that sent it.
