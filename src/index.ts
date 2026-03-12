import * as core from '@actions/core'
import * as github from '@actions/github'
import * as path from 'path'
import { checkFiles } from './checker'
import { getChangedTsFiles, postCheckAnnotations } from './github'

async function run(): Promise<void> {
  try {
    const token = core.getInput('github-token', { required: true })
    const tsconfigInput = core.getInput('tsconfig') || 'tsconfig.json'
    const failOnError = core.getInput('fail-on-error') !== 'false'
    const ignorePathsInput = core.getInput('ignore-paths') || 'node_modules/**,dist/**,build/**'
    const workingDir = core.getInput('working-directory') || '.'

    const ignorePaths = ignorePathsInput.split(',').map(p => p.trim()).filter(Boolean)
    const resolvedWorkingDir = path.resolve(process.cwd(), workingDir)

    const ctx = github.context

    if (!ctx.payload.pull_request) {
      core.info('Not a pull request, skipping.')
      return
    }

    const { number: pullNumber, head } = ctx.payload.pull_request
    const { owner, repo } = ctx.repo
    const sha = head.sha

    const octokit = github.getOctokit(token)

    // get changed ts files
    const changedFiles = await getChangedTsFiles(
      octokit, owner, repo, pullNumber, resolvedWorkingDir, ignorePaths
    )

    if (changedFiles.length === 0) {
      core.info('No TypeScript files changed in this PR.')
      await postCheckAnnotations(octokit, owner, repo, sha, [], 'PR TypeScript Checker')
      return
    }

    core.info(`Checking ${changedFiles.length} changed TypeScript file(s): ${changedFiles.join(', ')}`)

    const diagnostics = checkFiles(changedFiles, tsconfigInput, resolvedWorkingDir)

    const errors = diagnostics.filter(d => d.severity === 'error')
    const warnings = diagnostics.filter(d => d.severity === 'warning')

    core.info(`Found ${errors.length} error(s), ${warnings.length} warning(s)`)

    for (const d of diagnostics) {
      const msg = `${d.file}:${d.line}:${d.column} TS${d.code}: ${d.message}`
      if (d.severity === 'error') core.error(msg)
      else core.warning(msg)
    }

    await postCheckAnnotations(octokit, owner, repo, sha, diagnostics, 'PR TypeScript Checker')

    if (failOnError && errors.length > 0) {
      core.setFailed(`❌ Found ${errors.length} type error(s) in changed files.`)
    } else if (errors.length === 0) {
      core.info('✅ No type errors in changed files.')
    }
  } catch (err) {
    core.setFailed(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`)
  }
}

run()
