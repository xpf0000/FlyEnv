import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { promisify } from 'node:util'

import {
  buildWindowsCmdServiceStartCommand,
  buildWindowsPowerShellServiceStartScript
} from '../src/fork/util/ServiceStart.win'
import { powerShellInlineArgs } from '../src/shared/PowerShellCommand'

const execFilePromise = promisify(execFile)

const serverRoot = 'D:\\Program Files\\PhpWebStudy-Data\\server'
const appRoot = 'D:\\Program Files\\PhpWebStudy-Data\\app'
const reportPath = join(serverRoot, 'cache', 'flyenv-service-inline-real-test.json')

type ProcessInfo = {
  ProcessId: number
  ParentProcessId?: number
  Name?: string
  ExecutablePath?: string
  CommandLine?: string
}

type ParsedStart = {
  kind: 'cmd' | 'ps1'
  file: string
  name: string
  cwd: string
  bin: string
  execArgs: string
  execEnv: string
}

type TestResult = {
  name: string
  file: string
  kind: 'cmd' | 'ps1'
  status: 'passed' | 'failed'
  cwd: string
  bin: string
  execArgs: string
  missing: string[]
  stdout: string
  stderr: string
  outLog: string
  errLog: string
  startedPids: number[]
  startedProcesses: ProcessInfo[]
  error?: string
}

function psSingleQuoted(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

async function runPowerShell(script: string, timeout = 20000): Promise<string> {
  const res: any = await execFilePromise('powershell.exe', powerShellInlineArgs(script), {
    encoding: 'utf8',
    windowsHide: true,
    timeout,
    maxBuffer: 1024 * 1024 * 20
  })
  return `${res.stdout ?? ''}`.trim()
}

async function listStartFiles(): Promise<string[]> {
  const script = `
Get-ChildItem -LiteralPath ${psSingleQuoted(serverRoot)} -Recurse -File -Include '*-start.cmd','*-start.ps1' |
  Where-Object { $_.Name -like '*-start.cmd' -or $_.Name -like '*-start.ps1' } |
  Select-Object -ExpandProperty FullName |
  Sort-Object |
  ConvertTo-Json -Compress
`
  const out = await runPowerShell(script)
  const parsed = out ? JSON.parse(out) : []
  return Array.isArray(parsed) ? parsed : [parsed]
}

async function processList(): Promise<ProcessInfo[]> {
  const script = `
Get-CimInstance Win32_Process |
  Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine |
  ConvertTo-Json -Compress
`
  const out = await runPowerShell(script, 30000)
  const parsed = out ? JSON.parse(out) : []
  return Array.isArray(parsed) ? parsed : [parsed]
}

async function killProcessTree(pids: number[]): Promise<void> {
  if (!pids.length) return
  const ids = Array.from(new Set(pids.filter((pid) => Number.isFinite(pid) && pid > 0)))
  if (!ids.length) return
  const script = `
$ids = @(${ids.join(',')})
$all = Get-CimInstance Win32_Process
function Stop-Tree([int]$ProcessId) {
  $children = $all | Where-Object { $_.ParentProcessId -eq $ProcessId }
  foreach ($child in $children) { Stop-Tree ([int]$child.ProcessId) }
  try { Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue } catch {}
}
foreach ($id in $ids) { Stop-Tree ([int]$id) }
`
  await runPowerShell(script, 30000).catch(() => undefined)
}

function psUnescape(value: string): string {
  return value.replace(/`"/g, '"').replace(/""/g, '"').replace(/``/g, '`')
}

function parsePowerShellAssignment(lines: string[], name: string): string {
  const prefix = `$${name}`
  const line = lines.find((item) => item.trimStart().startsWith(prefix))
  assert.ok(line, `Missing ${prefix}`)
  const rhs = line.slice(line.indexOf('=') + 1).trim()
  assert.ok(rhs.startsWith('"') && rhs.endsWith('"'), `Unsupported ${prefix}: ${line}`)
  return psUnescape(rhs.slice(1, -1))
}

function parsePowerShellStart(file: string, content: string): ParsedStart {
  const lines = content.split(/\r?\n/)
  const bin = parsePowerShellAssignment(lines, 'BIN')
  const execArgs = parsePowerShellAssignment(lines, 'ARGS')
  const setLocation = lines.find((item) => item.trimStart().startsWith('Set-Location'))
  assert.ok(setLocation, 'Missing Set-Location')
  const cwdMatch = setLocation.match(/-Path\s+"([^"]+)"/i) ?? setLocation.match(/-LiteralPath\s+"([^"]+)"/i)
  assert.ok(cwdMatch, `Unsupported Set-Location: ${setLocation}`)
  const binIndex = lines.findIndex((item) => item.trimStart().startsWith('$BIN'))
  const envLines = lines
    .slice(0, binIndex)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('$env:'))
    .filter((line) => !line.startsWith('$env:LC_ALL') && !line.startsWith('$env:LANG'))

  return {
    kind: 'ps1',
    file,
    name: basename(file).replace(/-start\.ps1$/i, ''),
    cwd: cwdMatch[1],
    bin,
    execArgs,
    execEnv: envLines.join('\n')
  }
}

function splitCommand(command: string): { bin: string; execArgs: string } {
  const trimmed = command.trim()
  if (trimmed.startsWith('"')) {
    const end = trimmed.indexOf('"', 1)
    assert.ok(end > 1, `Unsupported quoted command: ${command}`)
    return {
      bin: trimmed.slice(1, end),
      execArgs: trimmed.slice(end + 1).trim()
    }
  }
  const match = trimmed.match(/^(\S+)(?:\s+([\s\S]*))?$/)
  assert.ok(match, `Unsupported command: ${command}`)
  return {
    bin: match[1],
    execArgs: match[2]?.trim() ?? ''
  }
}

function parseCmdStart(file: string, content: string): ParsedStart {
  const lines = content.split(/\r?\n/).map((line) => line.trim())
  const cwdLine = lines.find((line) => /^cd\s+\/d\s+/i.test(line))
  assert.ok(cwdLine, 'Missing cd /d')
  const cwdMatch = cwdLine.match(/^cd\s+\/d\s+"([^"]+)"/i)
  assert.ok(cwdMatch, `Unsupported cwd line: ${cwdLine}`)
  const startLine = lines.find((line) => /^start\s+/i.test(line))
  assert.ok(startLine, 'Missing start line')
  const startMatch = startLine.match(
    /^start(?:\s+"")?\s+\/B\s+([\s\S]+?)\s*>\s*"([^"]+)"\s*2>\s*"([^"]+)"$/i
  )
  assert.ok(startMatch, `Unsupported start line: ${startLine}`)
  const envLines = lines.filter((line) => /^set\s+/i.test(line))
  const { bin, execArgs } = splitCommand(startMatch[1])

  return {
    kind: 'cmd',
    file,
    name: basename(file).replace(/-start\.cmd$/i, ''),
    cwd: cwdMatch[1],
    bin,
    execArgs,
    execEnv: envLines.join('\n')
  }
}

async function parseStartFile(file: string): Promise<ParsedStart> {
  const content = await readFile(file, 'utf8')
  const ext = extname(file).toLowerCase()
  let parsed: ParsedStart
  if (ext === '.cmd') {
    parsed = parseCmdStart(file, content)
  } else if (ext === '.ps1') {
    parsed = parsePowerShellStart(file, content)
  } else {
    throw new Error(`Unsupported start file: ${file}`)
  }
  return augmentParsedStart(parsed)
}

async function resolveErlangHome(): Promise<string> {
  if (!existsSync(appRoot)) return ''
  const dirs = (await readdir(appRoot))
    .filter((dir) => /^erlang-/i.test(dir))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
  for (const dir of dirs) {
    const erlangHome = join(appRoot, dir)
    if (existsSync(join(erlangHome, 'bin/erl.exe'))) {
      return erlangHome
    }
  }
  return ''
}

async function augmentParsedStart(parsed: ParsedStart): Promise<ParsedStart> {
  if (!/^rabbitmq-/i.test(parsed.name)) {
    return parsed
  }
  const erlangHome = await resolveErlangHome()
  if (!erlangHome) {
    return parsed
  }
  const envLines = [
    parsed.execEnv,
    `set "ERLANG_HOME=${erlangHome}"`,
    `set "PATH=${join(erlangHome, 'bin')};%PATH%"`
  ].filter(Boolean)
  return {
    ...parsed,
    execEnv: envLines.join('\n')
  }
}

function resolveBin(cwd: string, bin: string): string {
  const normalized = bin.replace(/^\.\//, '').replace(/^\.[\\/]/, '')
  if (/^[a-z]:[\\/]/i.test(normalized)) return normalized
  return join(cwd, normalized)
}

function isRelatedProcess(proc: ProcessInfo, parsed: ParsedStart): boolean {
  const normalize = (value: string) => value.toLowerCase().replace(/\//g, '\\')
  const text = normalize(`${proc.ExecutablePath ?? ''}\n${proc.CommandLine ?? ''}`)
  const cwd = normalize(parsed.cwd)
  const server = normalize(dirname(parsed.file))
  const resolvedBin = normalize(resolveBin(parsed.cwd, parsed.bin))
  const binDir = normalize(dirname(resolvedBin))
  const binName = basename(resolvedBin).toLowerCase()
  const appRoot = 'd:\\program files\\phpwebstudy-data\\app'
  const dataAppRoot = 'e:\\github\\flyenv\\data\\app'
  return (
    text.includes(cwd) ||
    text.includes(server) ||
    text.includes(resolvedBin) ||
    text.includes(binDir) ||
    text.includes(binName) ||
    text.includes(appRoot) ||
    text.includes(dataAppRoot)
  )
}

async function runOne(
  parsed: ParsedStart,
  before: ProcessInfo[],
  baselineIds: Set<number>,
  index: number
): Promise<TestResult> {
  const reportDir = join(serverRoot, 'cache', 'flyenv-service-inline-real-test')
  await mkdir(reportDir, { recursive: true })
  const outFile = join(reportDir, `${String(index).padStart(2, '0')}-${parsed.name}-out.log`)
  const errFile = join(reportDir, `${String(index).padStart(2, '0')}-${parsed.name}-err.log`)
  const missing = [
    existsSync(parsed.cwd) ? '' : `cwd: ${parsed.cwd}`,
    existsSync(resolveBin(parsed.cwd, parsed.bin)) ? '' : `bin: ${resolveBin(parsed.cwd, parsed.bin)}`
  ].filter(Boolean)

  let stdout = ''
  let stderr = ''
  let error: string | undefined
  let startedProcesses: ProcessInfo[] = []

  try {
    if (missing.length) {
      throw new Error(`Missing required path: ${missing.join('; ')}`)
    }
    if (parsed.kind === 'cmd') {
      const command = buildWindowsCmdServiceStartCommand({
        execEnv: parsed.execEnv,
        cwd: parsed.cwd,
        bin: parsed.bin,
        execArgs: parsed.execArgs,
        outFile,
        errFile
      })
      const res: any = await execFilePromise('cmd.exe', ['/d', '/s', '/c', command], {
        encoding: 'utf8',
        windowsHide: true,
        windowsVerbatimArguments: true,
        timeout: 20000,
        maxBuffer: 1024 * 1024 * 10
      })
      stdout = `${res.stdout ?? ''}`.trim()
      stderr = `${res.stderr ?? ''}`.trim()
    } else {
      const script = buildWindowsPowerShellServiceStartScript({
        execEnv: parsed.execEnv,
        cwd: parsed.cwd,
        bin: parsed.bin,
        execArgs: parsed.execArgs,
        outFile,
        errFile
      })
      const res: any = await execFilePromise('powershell.exe', powerShellInlineArgs(script), {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 20000,
        maxBuffer: 1024 * 1024 * 10
      })
      stdout = `${res.stdout ?? ''}`.trim()
      stderr = `${res.stderr ?? ''}`.trim()
    }

    await new Promise((resolve) => setTimeout(resolve, 6000))
    const after = await processList()
    const beforeIds = new Set(before.map((proc) => proc.ProcessId))
    startedProcesses = after
      .filter((proc) => !beforeIds.has(proc.ProcessId))
      .filter((proc) => isRelatedProcess(proc, parsed))

    if (!startedProcesses.length) {
      const errLog = existsSync(errFile) ? await readFile(errFile, 'utf8') : ''
      if (stderr || errLog.trim()) {
        throw new Error(
          `No related service process remained after startup wait. launcher stderr: ${stderr.slice(0, 1000)} service stderr log: ${errLog.trim().slice(0, 1000)}`
        )
      }
      throw new Error('No related service process remained after startup wait')
    }
  } catch (e: any) {
    error = e?.message ?? `${e}`
  } finally {
    await killProcessTree(startedProcesses.map((proc) => proc.ProcessId))
    const leftovers = (await processList().catch((): ProcessInfo[] => []))
      .filter((proc) => !baselineIds.has(proc.ProcessId))
      .filter((proc) => isRelatedProcess(proc, parsed))
    await killProcessTree(leftovers.map((proc) => proc.ProcessId))
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  return {
    name: parsed.name,
    file: parsed.file,
    kind: parsed.kind,
    status: error ? 'failed' : 'passed',
    cwd: parsed.cwd,
    bin: resolveBin(parsed.cwd, parsed.bin),
    execArgs: parsed.execArgs,
    missing,
    stdout,
    stderr,
    outLog: existsSync(outFile) ? await readFile(outFile, 'utf8') : '',
    errLog: existsSync(errFile) ? await readFile(errFile, 'utf8') : '',
    startedPids: startedProcesses.map((proc) => proc.ProcessId),
    startedProcesses,
    error
  }
}

async function writeReport(results: TestResult[]) {
  const summary = {
    total: results.length,
    passed: results.filter((item) => item.status === 'passed').length,
    failed: results.filter((item) => item.status === 'failed').length
  }
  await writeFile(reportPath, JSON.stringify({ summary, results }, null, 2), 'utf8')
  return summary
}

async function main() {
  assert.equal(process.platform, 'win32', 'This test only runs on Windows')
  await mkdir(dirname(reportPath), { recursive: true })
  const files = await listStartFiles()
  const parsed = []
  for (const file of files) {
    parsed.push(await parseStartFile(file))
  }

  const startIndex = Math.max(1, Number(process.env.FLYENV_TEST_START_INDEX || 1))
  const endIndex = Math.min(parsed.length, Number(process.env.FLYENV_TEST_END_INDEX || parsed.length))
  const baseline = await processList()
  const baselineIds = new Set(baseline.map((proc) => proc.ProcessId))

  const results: TestResult[] = []
  for (let i = startIndex - 1; i < endIndex; i += 1) {
    const item = parsed[i]
    console.log(`[${i + 1}/${parsed.length}] ${item.name}`)
    const before = await processList()
    const result = await runOne(item, before, baselineIds, i + 1)
    results.push(result)
    await writeReport(results)
    console.log(`  ${result.status}${result.error ? `: ${result.error}` : ''}`)
  }

  const summary = await writeReport(results)
  console.log(JSON.stringify({ summary, reportPath }, null, 2))

  if (summary.failed > 0) {
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
