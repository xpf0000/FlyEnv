import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { readFile, realpath } from 'node:fs/promises'
import { isAbsolute, join, dirname } from 'node:path'
import type { BrewFormulaSnapshot, BrewIdentity } from './UpgradeTypes'

export const formulaName = (value: string) => {
  if (!/^(?:[a-zA-Z0-9_.+-]+\/){0,2}[a-zA-Z0-9_+.-]+(?:@[a-zA-Z0-9_.+-]+)?$/.test(value))
    throw new Error('Invalid Homebrew formula')
  if (value.split('/').some((part) => part === '.' || part === '..'))
    throw new Error('Invalid Homebrew formula')
  return value.includes('/') ? value : `homebrew/core/${value}`
}
export const fingerprint = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')
export const brewEnvironment = (env: NodeJS.ProcessEnv) => ({
  ...env,
  HOMEBREW_NO_AUTO_UPDATE: '1',
  HOMEBREW_NO_ASK: '1',
  HOMEBREW_NO_INSTALL_CLEANUP: '1',
  HOMEBREW_NO_ANALYTICS: '1'
})
export function queryBrew(bin: string, args: string[], env = process.env): Promise<string> {
  if (!isAbsolute(bin)) return Promise.reject(new Error('Homebrew executable must be absolute'))
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      { env: brewEnvironment(env), maxBuffer: 16 * 1024 * 1024, timeout: 120_000 },
      (error, stdout) => {
        // Some brew versions return 1 when named formulae are outdated; JSON remains authoritative.
        if (error && !(args[0] === 'outdated' && stdout.trim().startsWith('{'))) reject(error)
        else resolve(stdout.trim())
      }
    )
  })
}
type Info = {
  name: string
  full_name: string
  tap: string
  versions: { stable: string }
  revision?: number
  installed: { version: string }[]
  outdated?: boolean
  pinned?: boolean
  disabled?: boolean
  dependencies?: string[]
  build_dependencies?: string[]
  recommended_dependencies?: string[]
}
export async function inspectFormula(
  identity: BrewIdentity,
  item: Info,
  outdated: string[]
): Promise<BrewFormulaSnapshot> {
  if (!/^[a-zA-Z0-9_+.-]+(?:@[a-zA-Z0-9_.+-]+)?$/.test(item.name) || item.name === '..')
    throw new Error('Invalid formula rack')
  const formula = formulaName(item.full_name)
  const versions = item.installed.map((i) => i.version).sort()
  const kegs: string[] = []
  const receipts: unknown[] = []
  let verified = versions.length > 0
  for (const version of versions) {
    if (!/^[a-zA-Z0-9_.+-]+$/.test(version) || version === '..') {
      verified = false
      continue
    }
    try {
      const keg = await realpath(join(identity.cellar, item.name, version))
      if (dirname(keg) !== join(identity.cellar, item.name))
        throw new Error('Keg outside confirmed Cellar')
      const receipt = JSON.parse(await readFile(join(keg, 'INSTALL_RECEIPT.json'), 'utf8'))
      if (receipt.source?.tap !== item.tap || (receipt.arch && receipt.arch !== identity.arch))
        verified = false
      receipts.push(receipt)
      kegs.push(keg)
    } catch {
      verified = false
    }
  }
  const isOutdated = item.outdated !== false && outdated.includes(formula)
  const reason = !verified
    ? 'identity'
    : item.pinned
      ? 'pinned'
      : item.disabled
        ? 'disabled'
        : !isOutdated
          ? 'latest'
          : undefined
  const value = {
    identity,
    formula,
    tap: item.tap,
    installedVersions: versions,
    availableVersion: `${item.versions.stable}${item.revision ? `_${item.revision}` : ''}`,
    kegs,
    affectedRacks: [join(identity.cellar, item.name)],
    pinned: !!item.pinned,
    outdated: isOutdated,
    eligible: !reason,
    reason
  }
  return { ...value, fingerprint: fingerprint([value, receipts]) }
}
export async function catalogFromInfo(identity: BrewIdentity, items: Info[], outdated: string[]) {
  const rows: BrewFormulaSnapshot[] = []
  for (const item of items) {
    try {
      rows.push(await inspectFormula(identity, item, outdated))
    } catch (error) {
      console.warn('Skipping invalid Homebrew formula:', item.name, String(error))
    }
  }
  return rows
}
export async function getBrewIdentity(bin: string, env = process.env): Promise<BrewIdentity> {
  const resolved = await realpath(bin)
  const [prefix, cellar] = await Promise.all([
    queryBrew(resolved, ['--prefix'], env),
    queryBrew(resolved, ['--cellar'], env)
  ])
  const arch = prefix === '/usr/local' ? 'x86_64' : process.arch === 'arm64' ? 'arm64' : 'x86_64'
  return { bin: resolved, prefix: await realpath(prefix), cellar: await realpath(cellar), arch }
}
export async function getUpgradeCatalog(bin: string, formulas: string[], env = process.env) {
  const identity = await getBrewIdentity(bin, env)
  const rows: BrewFormulaSnapshot[] = []
  for (const name of formulas) {
    try {
      const formula = formulaName(name)
      if (!/^php(?:@\d+(?:\.\d+)*)?$/.test(formula.split('/').at(-1)!)) continue
      const [info, outdated] = await Promise.all([
        queryBrew(identity.bin, ['info', '--json=v2', '--formula', formula], env),
        queryBrew(identity.bin, ['outdated', '--json=v2', '--formula', formula], env)
      ])
      rows.push(
        ...(await catalogFromInfo(
          identity,
          JSON.parse(info).formulae,
          JSON.parse(outdated).formulae.map((i: { name: string }) => formulaName(i.name))
        ))
      )
    } catch (error) {
      console.warn('Cannot inspect Homebrew formula:', name, String(error))
    }
  }
  return rows
}
/** Conservative dependency component includes dependencies and installed dependents, including broken linkage rebuilds. */
export async function inspectUpgrade(bin: string, name: string, env = process.env) {
  const [row] = await getUpgradeCatalog(bin, [name], env)
  if (!row) throw new Error('Cannot verify Homebrew formula')
  const all: Info[] = JSON.parse(
    await queryBrew(row.identity.bin, ['info', '--json=v2', '--installed', '--formula'], env)
  ).formulae
  const byName = new Map(all.map((i) => [i.name, i]))
  const connected = new Set([name.split('/').at(-1)!])
  let changed = true
  while (changed) {
    changed = false
    for (const item of all) {
      const deps = [
        ...(item.dependencies ?? []),
        ...(item.build_dependencies ?? []),
        ...(item.recommended_dependencies ?? [])
      ].map((d) => d.split('/').at(-1)!)
      if (connected.has(item.name) || deps.some((d) => connected.has(d))) {
        for (const n of [item.name, ...deps])
          if (!connected.has(n)) {
            connected.add(n)
            changed = true
          }
      }
    }
  }
  row.affectedRacks = [...connected].sort().map((n) => join(row.identity.cellar, n))
  if (
    [...connected].some((n) =>
      /^(mysql|mariadb|postgresql|mongodb(?:-community)?|redis|valkey|memcached)(?:@|$)/.test(n)
    )
  ) {
    row.eligible = false
    row.reason = 'dependencies'
  }
  row.fingerprint = fingerprint([row.fingerprint, [...connected].sort().map((n) => byName.get(n))])
  return row
}
