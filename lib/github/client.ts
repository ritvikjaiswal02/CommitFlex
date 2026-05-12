import { Octokit } from '@octokit/rest'

export function createOctokit(accessToken: string): Octokit {
  return new Octokit({ auth: accessToken })
}
