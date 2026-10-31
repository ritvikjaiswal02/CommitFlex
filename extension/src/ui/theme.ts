/** Extension pages follow the system theme. */
export function applyExtensionTheme(root: HTMLElement = document.documentElement): void {
  const media = matchMedia('(prefers-color-scheme: dark)')
  const apply = () => root.setAttribute('data-theme', media.matches ? 'dark' : 'light')
  apply()
  media.addEventListener('change', apply)
}
