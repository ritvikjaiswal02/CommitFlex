import { describe, it, expect, beforeAll } from 'vitest'

beforeAll(() => {
  process.env.OAUTH_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64)
})

describe('encrypt/decrypt', () => {
  it('round-trips plaintext correctly', async () => {
    const { encrypt, decrypt } = await import('@/lib/auth/encrypt')
    const plaintext = 'ghp_supersecrettoken'
    expect(decrypt(encrypt(plaintext))).toBe(plaintext)
  })

  it('produces different ciphertext each call (random IV)', async () => {
    const { encrypt } = await import('@/lib/auth/encrypt')
    const plaintext = 'same-token'
    expect(encrypt(plaintext)).not.toBe(encrypt(plaintext))
  })

  it('throws on tampered ciphertext', async () => {
    const { encrypt, decrypt } = await import('@/lib/auth/encrypt')
    const ciphertext = encrypt('token')
    const parts = ciphertext.split(':')
    parts[2] = Buffer.from('bad').toString('base64')
    expect(() => decrypt(parts.join(':'))).toThrow()
  })
})
