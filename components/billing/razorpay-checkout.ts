/**
 * Razorpay Checkout (https://checkout.razorpay.com/v1/checkout.js), loaded on
 * demand the first time someone clicks an upgrade button. Client-only.
 */

export const RAZORPAY_CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js'

export interface RazorpaySuccessResponse {
  razorpay_payment_id: string
  razorpay_subscription_id: string
  razorpay_signature: string
}

export interface RazorpayFailureResponse {
  error?: { code?: string; description?: string; reason?: string; source?: string; step?: string }
}

export interface RazorpayCheckoutOptions {
  key: string
  subscription_id: string
  name: string
  description: string
  prefill?: { name?: string; email?: string }
  notes?: Record<string, string>
  theme?: { color?: string }
  handler: (response: RazorpaySuccessResponse) => void
  modal?: { ondismiss?: () => void; escape?: boolean; confirm_close?: boolean }
}

export interface RazorpayCheckoutInstance {
  open: () => void
  close?: () => void
  on: (event: 'payment.failed', cb: (response: RazorpayFailureResponse) => void) => void
}

type RazorpayConstructor = new (options: RazorpayCheckoutOptions) => RazorpayCheckoutInstance

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor
  }
}

let loading: Promise<RazorpayConstructor> | null = null

/** Resolves with the Razorpay constructor, injecting the script once. */
export function loadRazorpayCheckout(timeoutMs = 15_000): Promise<RazorpayConstructor> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Razorpay Checkout needs a browser'))
  if (window.Razorpay) return Promise.resolve(window.Razorpay)
  if (loading) return loading

  loading = new Promise<RazorpayConstructor>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${RAZORPAY_CHECKOUT_SRC}"]`)
    const script = existing ?? document.createElement('script')

    const timer = window.setTimeout(() => fail(new Error('Razorpay Checkout took too long to load')), timeoutMs)
    function fail(err: Error) {
      window.clearTimeout(timer)
      loading = null
      if (!existing) script.remove()
      reject(err)
    }
    script.addEventListener('load', () => {
      window.clearTimeout(timer)
      if (window.Razorpay) resolve(window.Razorpay)
      else fail(new Error('Razorpay Checkout did not initialise'))
    })
    script.addEventListener('error', () => fail(new Error('Razorpay Checkout could not be loaded')))

    if (!existing) {
      script.src = RAZORPAY_CHECKOUT_SRC
      script.async = true
      document.body.appendChild(script)
    }
  })
  return loading
}

/** Brand accent for the Razorpay modal, matching the --c-accent token (light). */
export const CHECKOUT_THEME_COLOR = '#2B3FE0'
