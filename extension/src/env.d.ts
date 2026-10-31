/** Injected by build.mjs (esbuild `define`). */
declare const __APP_URL__: string
declare const __APP_ORIGINS__: string[]
declare const __VERSION__: string

declare module '*.css' {
  const css: string
  export default css
}
