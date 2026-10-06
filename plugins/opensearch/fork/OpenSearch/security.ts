import { dirname, join } from 'path'
import { existsSync } from 'fs'
import { mkdirp, readFile, writeFile } from '@fork/Fn'
import type { SoftInstalled } from '@shared/app'
import { resolveConfDir } from './homebrew'

const DISABLED_KEY = 'plugins.security.disabled'
const COMMENT_MARK = '# flyenv-dev-mode:'
const DISABLED_TRUE_REG = /^plugins\.security\.disabled\s*:\s*true\s*(#.*)?$/

const configFile = (version: SoftInstalled) => join(resolveConfDir(version.path), 'opensearch.yml')

const isActiveDisabledLine = (line: string) => {
  const trimmed = line.trim()
  return !trimmed.startsWith('#') && trimmed.startsWith(`${DISABLED_KEY}:`)
}

const isActiveSecurityLine = (line: string) => {
  const trimmed = line.trim()
  return (
    !trimmed.startsWith('#') &&
    trimmed.startsWith('plugins.security.') &&
    !trimmed.startsWith(`${DISABLED_KEY}:`)
  )
}

export const fetchDevModeState = async (version: SoftInstalled): Promise<boolean> => {
  const file = configFile(version)
  if (!existsSync(file)) {
    return false
  }
  const content = await readFile(file, 'utf-8')
  return content
    .split('\n')
    .some((line) => !line.trim().startsWith('#') && DISABLED_TRUE_REG.test(line.trim()))
}

export const applyDevMode = async (version: SoftInstalled, enable: boolean): Promise<string> => {
  const file = configFile(version)
  let lines: string[] = []
  if (existsSync(file)) {
    lines = (await readFile(file, 'utf-8')).split('\n')
  } else {
    await mkdirp(dirname(file))
  }
  const out: string[] = []
  for (const line of lines) {
    if (isActiveDisabledLine(line)) {
      continue
    }
    if (enable && isActiveSecurityLine(line)) {
      out.push(`${COMMENT_MARK} ${line}`)
      continue
    }
    if (!enable) {
      const trimmed = line.trim()
      if (trimmed.startsWith(COMMENT_MARK)) {
        const restored = trimmed.slice(COMMENT_MARK.length).trimStart()
        if (restored.startsWith('plugins.security.')) {
          out.push(restored)
          continue
        }
      }
    }
    out.push(line)
  }
  if (enable) {
    while (out.length > 0 && out[out.length - 1].trim() === '') {
      out.pop()
    }
    out.push(`${DISABLED_KEY}: true`)
    out.push('')
  }
  await writeFile(file, out.join('\n'))
  return file
}
