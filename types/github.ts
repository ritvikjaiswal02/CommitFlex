export interface RawCommit {
  sha: string
  message: string
  author: string
  date: string
  url: string
}

export interface FilteredCommits {
  commits: RawCommit[]
  skippedShas: string[]
}

export interface GithubRepo {
  id: number
  name: string
  fullName: string
  private: boolean
  defaultBranch: string
  owner: { login: string; type: 'User' | 'Organization' }
}
