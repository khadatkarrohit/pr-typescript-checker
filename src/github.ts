import { GitHub } from '@actions/github/lib/utils'
import * as path from 'path'
import { Diagnostic } from './checker'

type Octokit = InstanceType<typeof GitHub>

export async function getChangedTsFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  workingDir: string,
  ignorePatterns: string[]
): Promise<string[]> {
  const files: string[] = []
  let page = 1

  while (true) {
    const { data } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
      page
    })

    for (const f of data) {
      if (f.status === 'removed') continue
      if (!/\.(ts|tsx)$/.test(f.filename)) continue
      if (f.filename.endsWith('.d.ts')) continue

      const shouldIgnore = ignorePatterns.some(p => {
        const rel = path.relative(workingDir, f.filename)
        return rel.startsWith(p.replace('/**', '')) || f.filename.includes(p.replace('/**', '').replace('**/', ''))
      })
      if (shouldIgnore) continue

      files.push(f.filename)
    }

    if (data.length < 100) break
    page++
  }

  return files
}

export async function postCheckAnnotations(
  octokit: Octokit,
  owner: string,
  repo: string,
  sha: string,
  diagnostics: Diagnostic[],
  name: string
): Promise<void> {
  const BATCH_SIZE = 50

  const conclusion = diagnostics.some(d => d.severity === 'error') ? 'failure' : 'success'
  const summary = diagnostics.length === 0
    ? 'No type errors found in changed files.'
    : `Found ${diagnostics.filter(d => d.severity === 'error').length} error(s) in changed TypeScript files.`

  const allAnnotations = diagnostics.map(d => ({
    path: d.file,
    start_line: d.line,
    end_line: d.line,
    start_column: d.column,
    end_column: d.column,
    annotation_level: (d.severity === 'error' ? 'failure' : 'warning') as 'failure' | 'warning' | 'notice',
    message: `TS${d.code}: ${d.message}`,
    title: `TypeScript ${d.severity}`
  }))

  // GitHub API allows max 50 annotations per request — create check run with first batch
  const firstBatch = allAnnotations.slice(0, BATCH_SIZE)

  const { data: checkRun } = await octokit.rest.checks.create({
    owner,
    repo,
    name,
    head_sha: sha,
    status: 'completed',
    conclusion,
    output: {
      title: summary,
      summary,
      annotations: firstBatch
    }
  })

  // update with remaining batches
  for (let i = BATCH_SIZE; i < allAnnotations.length; i += BATCH_SIZE) {
    const batch = allAnnotations.slice(i, i + BATCH_SIZE)
    await octokit.rest.checks.update({
      owner,
      repo,
      check_run_id: checkRun.id,
      output: {
        title: summary,
        summary,
        annotations: batch
      }
    })
  }
}
