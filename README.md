# pr-typescript-checker

A GitHub Action that type-checks only the TypeScript files changed in a PR using the TypeScript compiler API — not the full project. Faster, focused, and posts inline PR annotations.

## Why this is different

Other TypeScript check actions run full `tsc` on the entire project and then filter the output. This action uses `program.getSemanticDiagnostics(sourceFile)` from the TypeScript compiler API to check only changed files. On large codebases this is significantly faster.

| | reviewdog-action-tsc | pr-typescript-checker |
|--|--|--|
| Checks full project | Yes | No — changed files only |
| TypeScript API | No (CLI) | Yes (compiler API) |
| Inline annotations | Yes | Yes |
| External dependencies | reviewdog | None |
| Monorepo aware | No | Planned |

## Quick start

```yaml
# .github/workflows/typecheck.yml
name: Type Check PR

on: [pull_request]

jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install dependencies
        run: npm ci

      - uses: khadatkarrohit/pr-typescript-checker@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

## Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `github-token` | `${{ github.token }}` | GitHub token (needs `checks: write` permission) |
| `tsconfig` | `tsconfig.json` | Path to tsconfig.json |
| `fail-on-error` | `true` | Fail the workflow if type errors are found |
| `ignore-paths` | `node_modules/**,dist/**,build/**` | Comma-separated globs to skip |
| `working-directory` | `.` | Directory containing the TypeScript project |

## Permissions

The action needs `checks: write` to post inline annotations:

```yaml
permissions:
  checks: write
  pull-requests: read
```

## How it works

1. Gets the list of changed `.ts`/`.tsx` files from the PR via GitHub API
2. Creates a TypeScript `Program` using your `tsconfig.json` (all project files load for type resolution)
3. Calls `program.getSemanticDiagnostics(sourceFile)` for each changed file only
4. Posts errors as GitHub Check annotations directly on the diff lines
5. Fails the workflow if any errors are found and `fail-on-error` is true

## License

MIT
