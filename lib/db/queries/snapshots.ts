import { db } from '@/lib/db/client'
import { commitSnapshots } from '@/lib/db/schema'
import type { RawCommit } from '@/types/github'

export async function persistCommitSnapshots(jobId: string, commits: RawCommit[]) {
  if (commits.length === 0) return
  await db.insert(commitSnapshots).values(
    commits.map(commit => ({
      jobId,
      commitSha: commit.sha,
      message: commit.message,
      author: commit.author,
      committedAt: new Date(commit.date),
      includedInGeneration: true,
    }))
  )
}
