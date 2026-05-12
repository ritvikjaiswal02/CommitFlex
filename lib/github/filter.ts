import type { RawCommit, FilteredCommits } from '@/types/github'

const SKIP_PREFIXES = ['merge', 'chore(', 'chore:', 'wip:', 'fixup!', 'squash!']
const SKIP_PATTERNS = [/^merge (pull request|branch)/i, /^bump version/i, /^revert "/i]
const BOT_AUTHORS = ['dependabot', 'github-actions', 'renovate', 'semantic-release-bot']

export function filterCommits(commits: RawCommit[], authorLogin?: string): FilteredCommits {
  const skipped: string[] = []
  const kept: RawCommit[] = []

  for (const commit of commits) {
    const msgLower = commit.message.toLowerCase()
    const authorLower = commit.author.toLowerCase()

    if (BOT_AUTHORS.some(bot => authorLower.includes(bot))) {
      skipped.push(commit.sha)
      continue
    }

    if (authorLogin && authorLower !== authorLogin.toLowerCase()) {
      skipped.push(commit.sha)
      continue
    }

    if (SKIP_PREFIXES.some(p => msgLower.startsWith(p))) {
      skipped.push(commit.sha)
      continue
    }

    if (SKIP_PATTERNS.some(p => p.test(commit.message))) {
      skipped.push(commit.sha)
      continue
    }

    kept.push(commit)
  }

  return { commits: kept, skippedShas: skipped }
}
