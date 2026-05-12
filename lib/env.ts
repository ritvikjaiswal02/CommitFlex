const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'NEXTAUTH_SECRET',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'GEMINI_API_KEY',
  'OAUTH_TOKEN_ENCRYPTION_KEY',
] as const

type RequiredEnvVar = typeof REQUIRED_ENV_VARS[number]

function validateEnv(): Record<RequiredEnvVar, string> {
  const missing: string[] = []
  const env: Partial<Record<RequiredEnvVar, string>> = {}

  for (const key of REQUIRED_ENV_VARS) {
    const value = process.env[key]
    if (!value) {
      missing.push(key)
    } else {
      env[key] = value
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }

  const encKey = env.OAUTH_TOKEN_ENCRYPTION_KEY!
  if (encKey.length !== 64 || !/^[0-9a-f]+$/i.test(encKey)) {
    throw new Error('OAUTH_TOKEN_ENCRYPTION_KEY must be a 64-character hex string')
  }

  return env as Record<RequiredEnvVar, string>
}

// Only validate on the server, not during build-time static analysis
export const env = typeof window === 'undefined' && process.env.NODE_ENV !== 'test'
  ? validateEnv()
  : {} as Record<RequiredEnvVar, string>
