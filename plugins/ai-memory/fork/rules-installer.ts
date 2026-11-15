import { constants } from 'node:fs'
import { access, mkdir, open, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'
const START = '<!-- flyenv-ai-memory:start -->'
const END = '<!-- flyenv-ai-memory:end -->'
const CLIENTS = ['claudeCode', 'codex', 'antigravity', 'copilotCli', 'openCode', 'kimi']
/** Append-only installation: a marked existing block is retained, never rewritten. */
export class MemoryRulesInstaller {
  private readonly flights = new Map<string, Promise<{ path: string; unchanged?: boolean }>>()
  constructor(
    private readonly home = homedir(),
    private readonly env: NodeJS.ProcessEnv = process.env
  ) {}
  async install(
    client: string,
    rules: string,
    projectPath?: string
  ): Promise<{ path: string; unchanged?: boolean }> {
    if (
      !CLIENTS.includes(client) ||
      typeof rules !== 'string' ||
      !rules.trim() ||
      Buffer.byteLength(rules) > 16 * 1024 ||
      rules.includes(START) ||
      rules.includes(END)
    )
      throw new Error('rules_invalid')
    let directory: string
    let filename =
      client === 'claudeCode'
        ? 'CLAUDE.md'
        : client === 'antigravity'
          ? 'GEMINI.md'
          : client === 'copilotCli'
            ? 'copilot-instructions.md'
            : 'AGENTS.md'
    if (projectPath !== undefined) {
      if (
        typeof projectPath !== 'string' ||
        !isAbsolute(projectPath) ||
        projectPath.includes('\0') ||
        !(await stat(projectPath)).isDirectory()
      )
        throw new Error('rules_invalid_project')
      directory = await realpath(projectPath)
      if (client === 'copilotCli') directory = join(directory, '.github')
    } else {
      const base = (name: string, fallback: string) => this.env[name] || fallback
      directory = {
        claudeCode: base('CLAUDE_CONFIG_DIR', join(this.home, '.claude')),
        codex: base('CODEX_HOME', join(this.home, '.codex')),
        antigravity: base('GEMINI_HOME', join(this.home, '.gemini')),
        copilotCli: base('COPILOT_HOME', base('COPILOT_CONFIG_DIR', join(this.home, '.copilot'))),
        openCode: base(
          'OPENCODE_CONFIG_DIR',
          join(base('XDG_CONFIG_HOME', join(this.home, '.config')), 'opencode')
        ),
        kimi: base('KIMI_CODE_HOME', join(this.home, '.kimi-code'))
      }[client]!
    }
    if (!isAbsolute(directory)) throw new Error('rules_invalid')
    if (client === 'codex') {
      try {
        await access(join(directory, 'AGENTS.override.md'))
        filename = 'AGENTS.override.md'
      } catch (error: any) {
        if (error?.code !== 'ENOENT') throw error
      }
    }
    const path = join(directory, filename)
    const prior = this.flights.get(path)
    if (prior) {
      await prior
      return this.install(client, rules, projectPath)
    }
    const flight = this.append(path, rules, client === 'codex' ? 32 * 1024 : 1024 * 1024)
    this.flights.set(path, flight)
    try {
      return await flight
    } finally {
      this.flights.delete(path)
    }
  }
  private async append(path: string, rules: string, maxBytes: number) {
    await mkdir(dirname(path), { recursive: true })
    const file = await open(
      path,
      constants.O_RDWR | constants.O_CREAT | constants.O_APPEND | (constants.O_NOFOLLOW ?? 0),
      0o600
    )
    try {
      const metadata = await file.stat()
      if (!metadata.isFile() || metadata.size > maxBytes) throw new Error('rules_unavailable')
      const buffer = await file.readFile()
      if (buffer.length > maxBytes) throw new Error('rules_unavailable')
      const existing = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
      const starts = existing.split(START).length - 1
      const ends = existing.split(END).length - 1
      if (starts || ends) {
        if (starts !== 1 || ends !== 1 || existing.indexOf(END) < existing.indexOf(START))
          throw new Error('rules_invalid')
        return { path, unchanged: true }
      }
      const block = `${existing.endsWith('\n') || !existing ? '' : '\n'}\n${START}\n${rules.trim()}\n${END}\n`
      if (buffer.length + Buffer.byteLength(block) > maxBytes) throw new Error('rules_too_large')
      await file.appendFile(block, 'utf8')
      await file.sync()
      return { path }
    } finally {
      await file.close()
    }
  }
}
