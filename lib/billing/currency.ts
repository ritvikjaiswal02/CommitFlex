import type { Currency } from './catalog'

/**
 * Picks the display/checkout currency from the visitor's country.
 * India → INR, everywhere else → USD. Vercel sets `x-vercel-ip-country`;
 * `cf-ipcountry` covers Cloudflare in front of the app.
 */
export function detectCurrency(headers: Headers): Currency {
  const country = (headers.get('x-vercel-ip-country') ?? headers.get('cf-ipcountry') ?? '').trim().toUpperCase()
  return country === 'IN' ? 'INR' : 'USD'
}

/** Two-letter country code from the request, when the platform provides one. */
export function detectCountry(headers: Headers): string | null {
  const country = (headers.get('x-vercel-ip-country') ?? headers.get('cf-ipcountry') ?? '').trim().toUpperCase()
  return /^[A-Z]{2}$/.test(country) && country !== 'XX' ? country : null
}
