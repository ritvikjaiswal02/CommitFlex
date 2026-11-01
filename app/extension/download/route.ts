export const dynamic = 'force-static'

/**
 * GET /extension/download
 * The Chrome extension as a zip, for "Load unpacked" while the Chrome Web
 * Store listing is in review. `pnpm build` packs it into
 * public/commitflex-extension.zip, pointed at this deployment's URL.
 * A relative Location keeps this correct on every domain the app serves.
 */
export function GET() {
  return new Response(null, {
    status: 307,
    headers: {
      Location: '/commitflex-extension.zip',
      'Content-Disposition': 'attachment; filename="commitflex-extension.zip"',
    },
  })
}
