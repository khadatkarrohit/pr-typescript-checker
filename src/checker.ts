import * as ts from 'typescript'
import * as path from 'path'
import * as fs from 'fs'

export interface Diagnostic {
  file: string
  line: number
  column: number
  message: string
  code: number
  severity: 'error' | 'warning'
}

export function loadCompilerOptions(tsconfigPath: string): ts.CompilerOptions {
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile)
  if (configFile.error) {
    throw new Error(`Failed to read tsconfig: ${ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n')}`)
  }

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(tsconfigPath)
  )

  if (parsed.errors.length > 0) {
    throw new Error(`tsconfig parse errors: ${parsed.errors.map(e => ts.flattenDiagnosticMessageText(e.messageText, '\n')).join(', ')}`)
  }

  return parsed.options
}

export function checkFiles(
  changedFiles: string[],
  tsconfigPath: string,
  workingDir: string
): Diagnostic[] {
  const absoluteTsconfig = path.resolve(workingDir, tsconfigPath)

  if (!fs.existsSync(absoluteTsconfig)) {
    throw new Error(`tsconfig not found at ${absoluteTsconfig}`)
  }

  const options = loadCompilerOptions(absoluteTsconfig)

  // load all project files for type resolution, but only report errors for changed files
  const configFile = ts.readConfigFile(absoluteTsconfig, ts.sys.readFile)
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(absoluteTsconfig)
  )

  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options
  })

  const changedAbsolute = new Set(
    changedFiles.map(f => path.resolve(workingDir, f))
  )

  const diagnostics: Diagnostic[] = []

  for (const sourceFile of program.getSourceFiles()) {
    const filePath = sourceFile.fileName

    // only report diagnostics for changed files
    if (!changedAbsolute.has(filePath)) continue
    // skip declaration files
    if (filePath.endsWith('.d.ts')) continue

    const fileDiags = program.getSemanticDiagnostics(sourceFile)

    for (const diag of fileDiags) {
      const formatted = formatDiagnostic(diag, workingDir)
      if (formatted) diagnostics.push(formatted)
    }
  }

  return diagnostics
}

export function formatDiagnostic(diag: ts.Diagnostic, workingDir: string): Diagnostic | null {
  if (!diag.file || diag.start === undefined) return null

  const { line, character } = diag.file.getLineAndCharacterOfPosition(diag.start)
  const message = ts.flattenDiagnosticMessageText(diag.messageText, '\n')
  const relPath = path.relative(workingDir, diag.file.fileName)

  return {
    file: relPath,
    line: line + 1,
    column: character + 1,
    message,
    code: diag.code,
    severity: diag.category === ts.DiagnosticCategory.Error ? 'error' : 'warning'
  }
}
