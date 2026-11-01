/**
 * Recent ship moments for one repository, for the "Draft a post" pickers:
 * the last merged pull requests and the last releases (or tags when the repo
 * doesn't publish releases). One GraphQL call.
 */
import type { Octokit } from '@octokit/rest'
import { splitFullName } from './webhook'

export interface RecentPullRequest {
  number: number
  title: string
  url: string
  mergedAt: string
  additions: number
  deletions: number
  author: string | null
}

export interface RecentRelease {
  tag: string
  name: string | null
  publishedAt: string | null
  prerelease: boolean
  /** 'release' for a GitHub release, 'tag' for a bare git tag. */
  kind: 'release' | 'tag'
}

export interface RecentActivity {
  pullRequests: RecentPullRequest[]
  releases: RecentRelease[]
}

interface GraphqlResult {
  repository: {
    pullRequests: {
      nodes: ({
        number: number
        title: string
        url: string
        mergedAt: string | null
        additions: number
        deletions: number
        author: { login: string } | null
      } | null)[]
    }
    releases: {
      nodes: ({ tagName: string; name: string | null; publishedAt: string | null; isDraft: boolean; isPrerelease: boolean } | null)[]
    }
    refs: { nodes: ({ name: string } | null)[] } | null
  } | null
}

const QUERY = `
  query RecentShips($owner: String!, $name: String!, $prs: Int!, $releases: Int!) {
    repository(owner: $owner, name: $name) {
      pullRequests(states: MERGED, first: $prs, orderBy: { field: UPDATED_AT, direction: DESC }) {
        nodes { number title url mergedAt additions deletions author { login } }
      }
      releases(first: $releases, orderBy: { field: CREATED_AT, direction: DESC }) {
        nodes { tagName name publishedAt isDraft isPrerelease }
      }
      refs(refPrefix: "refs/tags/", first: $releases, orderBy: { field: TAG_COMMIT_DATE, direction: DESC }) {
        nodes { name }
      }
    }
  }
`

export async function getRecentActivity(
  octokit: Octokit,
  fullName: string,
  opts: { pullRequests?: number; releases?: number } = {},
): Promise<RecentActivity> {
  const { owner, repo } = splitFullName(fullName)
  const data = await octokit.graphql<GraphqlResult>(QUERY, {
    owner,
    name: repo,
    prs: Math.min(opts.pullRequests ?? 20, 50),
    releases: Math.min(opts.releases ?? 10, 30),
  })
  const r = data.repository
  if (!r) return { pullRequests: [], releases: [] }

  const pullRequests = r.pullRequests.nodes
    .filter((n): n is NonNullable<typeof n> => !!n && !!n.mergedAt)
    .map((n) => ({
      number: n.number,
      title: n.title,
      url: n.url,
      mergedAt: n.mergedAt as string,
      additions: n.additions,
      deletions: n.deletions,
      author: n.author?.login ?? null,
    }))
    .sort((a, b) => b.mergedAt.localeCompare(a.mergedAt))

  let releases: RecentRelease[] = r.releases.nodes
    .filter((n): n is NonNullable<typeof n> => !!n && !n.isDraft)
    .map((n) => ({ tag: n.tagName, name: n.name, publishedAt: n.publishedAt, prerelease: n.isPrerelease, kind: 'release' as const }))
  if (releases.length === 0 && r.refs) {
    releases = r.refs.nodes
      .filter((n): n is NonNullable<typeof n> => !!n)
      .map((n) => ({ tag: n.name, name: null, publishedAt: null, prerelease: false, kind: 'tag' as const }))
  }
  return { pullRequests, releases }
}
