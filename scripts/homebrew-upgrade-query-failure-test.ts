import assert from 'node:assert/strict'
import { loadIsolated } from './helpers/load-isolated'

const failures = new Map<string, string>([
  ['php@8.4', 'timeout'],
  ['php@8.3', 'json']
])
let identityFailed = false
let databaseAffected = false
const { getUpgradeCatalog, inspectUpgrade, queryBrew } = await loadIsolated(
  'src/fork/module/Brew/UpgradeCatalog.ts',
  {
    'node:child_process': {
      execFile(_bin: string, args: string[], _options: any, callback: any) {
        const name = args.at(-1)!.split('/').at(-1)!
        if (identityFailed) return callback(new Error('prefix unavailable'), '')
        if (args[0] === '--prefix') return callback(null, '/brew')
        if (args[0] === '--cellar') return callback(null, '/brew/Cellar')
        const failure = failures.get(name)
        if (failure === 'timeout') return callback(new Error('query timed out'), '')
        if (failure === 'partial-timeout')
          return callback(
            Object.assign(new Error('query timed out'), { killed: true, signal: 'SIGTERM' }),
            '{"formulae":[]}'
          )
        if (failure === 'json') return callback(null, '{invalid')
        if (failure === 'empty') return callback(null, '{"formulae":[]}')
        if (args[0] === 'outdated')
          return callback(
            Object.assign(new Error('outdated'), { code: 1 }),
            JSON.stringify({ formulae: [{ name }] })
          )
        const info = {
          name,
          full_name: name,
          tap: 'homebrew/core',
          versions: { stable: '8.5.12' },
          installed: [{ version: '8.5.7' }],
          outdated: true,
          dependencies: databaseAffected ? ['icu4c'] : []
        }
        const formulae =
          databaseAffected && args.includes('--installed')
            ? [
                { ...info, name: 'php', full_name: 'php' },
                { ...info, name: 'icu4c', full_name: 'icu4c', dependencies: [] },
                { ...info, name: 'mariadb', full_name: 'mariadb' }
              ]
            : [info]
        callback(null, JSON.stringify({ formulae }))
      }
    },
    'node:fs/promises': {
      realpath: async (path: string) => path,
      readFile: async () => JSON.stringify({ source: { tap: 'homebrew/core' } })
    }
  },
  { console: { warn() {} } }
)
const partial = await getUpgradeCatalog('/brew/bin/brew', ['php@8.4', 'php', 'php@8.3'])
assert.deepEqual(
  Array.from(partial.rows, (row: any) => row.formula),
  ['homebrew/core/php']
)
assert.equal(partial.failures.length, 2)
assert.match(partial.failures[0].error, /timed out/)
assert.equal(partial.failures[1].formula, 'homebrew/core/php@8.3')
const all = await getUpgradeCatalog('/brew/bin/brew', ['php@8.4'])
assert.equal(all.rows.length, 0)
assert.equal(all.failures.length, 1)
await assert.rejects(inspectUpgrade('/brew/bin/brew', 'php@8.4'), /timed out/)
failures.set('php@8.4', 'empty')
assert.equal((await getUpgradeCatalog('/brew/bin/brew', ['php@8.4'])).failures.length, 1)
failures.set('php@8.4', 'partial-timeout')
await assert.rejects(
  queryBrew('/brew/bin/brew', ['outdated', '--json=v2', '--formula', 'php@8.4']),
  /timed out/
)
identityFailed = true
await assert.rejects(getUpgradeCatalog('/brew/bin/brew', ['php']), /prefix unavailable/)
identityFailed = false
databaseAffected = true
const withDatabase = await inspectUpgrade('/brew/bin/brew', 'php')
assert(withDatabase.affectedRacks.includes('/brew/Cellar/mariadb'))
assert.equal(withDatabase.eligible, true)
assert.equal(withDatabase.reason, undefined)
databaseAffected = false
const otherFormula = await inspectUpgrade('/brew/bin/brew', 'composer')
assert.equal(otherFormula.formula, 'homebrew/core/composer')
assert.equal(otherFormula.eligible, true)
const selectedBrew = '/home/linuxbrew/.linuxbrew/bin/brew'
const paths: string[] = []
const linuxServer: Record<string, unknown> = {}
const { CheckBrewOrPort } = await loadIsolated(
  'src/main/utils/CheckBrew.ts',
  {
    '@shared/utils': { isMacOS: () => false, isLinux: () => true },
    'node:os': { userInfo: () => ({ homedir: '/home/current' }) },
    'node:fs': { existsSync: () => true },
    '@shared/child-process': {
      spawnPromiseWithEnv: async (bin: string, args: string[]) => {
        if (bin === 'which') return { stdout: selectedBrew + '\n' }
        if (args[0] === '--repo' || args[0] === '--cellar') {
          paths.push(bin)
          return { stdout: args[0] === '--repo' ? '/shared' : '/shared/Cellar' }
        }
        return { stdout: '' }
      }
    }
  },
  { global: { Server: linuxServer } }
)
await new Promise<void>((resolve) =>
  CheckBrewOrPort(() => {
    if (linuxServer.BrewCellar) resolve()
  })
)
assert.deepEqual(paths, [selectedBrew, selectedBrew])
assert.equal(linuxServer.BrewBin, selectedBrew)
assert.equal(linuxServer.BrewCellar, '/shared/Cellar')
const pinnedBrew = '/pinned installation/bin/brew'
const metadataCalls: Array<{ bin: string; args: string[]; shell: boolean }> = []
const { brewInfoJson } = await loadIsolated(
  'src/fork/util/Version.ts',
  {
    '@shared/compare-versions': {},
    '@shared/Gvm': {},
    '@shared/utils': {},
    'node:fs': { statSync: () => ({ isDirectory: () => true }) },
    './BinVersionCache': {},
    './BrewFormula': {
      brewFormulaInstalledForTap: async (_item: unknown, dirs: string[]) => {
        assert.deepEqual(Array.from(dirs), ['/pinned installation/Cellar'])
        return true
      }
    },
    '../Fn': {
      existsSync: () => true,
      realpathSync: (dir: string) => dir,
      spawnPromiseWithEnv: async (bin: string, args: string[], { shell }: { shell: boolean }) => {
        metadataCalls.push({ bin, args: Array.from(args), shell })
        if (args[0] === '--cellar') return { stdout: '/pinned installation/Cellar' }
        return {
          stdout: JSON.stringify([
            {
              full_name: 'php',
              tap: 'homebrew/core',
              installed: [{ version: '8.5.7' }],
              versions: { stable: '8.5.12' }
            }
          ])
        }
      }
    }
  },
  { global: { Server: { BrewBin: pinnedBrew } } }
)
assert.equal((await brewInfoJson(['php'], { tapAware: true }))[0]?.installed, true)
assert.deepEqual(metadataCalls, [
  { bin: pinnedBrew, args: ['info', 'php', '--json', '--formula'], shell: false },
  { bin: pinnedBrew, args: ['--cellar'], shell: false }
])
console.log(
  'PASS catalog queries: partial/all failures, malformed JSON, missing metadata, identity prerequisite, timeout JSON rejected, explicit outdated exit accepted'
)
