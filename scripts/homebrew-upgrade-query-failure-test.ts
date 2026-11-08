import assert from 'node:assert/strict'
import { loadIsolated } from './helpers/load-isolated'

const failures = new Map<string, string>([
  ['php@8.4', 'timeout'],
  ['php@8.3', 'json']
])
let identityFailed = false
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
        callback(
          null,
          JSON.stringify({
            formulae: [
              {
                name,
                full_name: name,
                tap: 'homebrew/core',
                versions: { stable: '8.5.12' },
                installed: [{ version: '8.5.7' }],
                outdated: true,
                dependencies: []
              }
            ]
          })
        )
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
console.log(
  'PASS catalog queries: partial/all failures, malformed JSON, missing metadata, identity prerequisite, timeout JSON rejected, explicit outdated exit accepted'
)
