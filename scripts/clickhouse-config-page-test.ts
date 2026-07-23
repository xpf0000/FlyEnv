import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ClickHouse from '../src/fork/module/ClickHouse'

const root = join(import.meta.dirname, '..')
const forkSource = readFileSync(join(root, 'src/fork/module/ClickHouse/index.ts'), 'utf-8')
const pageSource = readFileSync(join(root, 'src/render/components/ClickHouse/Config.vue'), 'utf-8')

assert.match(forkSource, /await this\.initConfig\(\)\.on\(on\)/)

type ClickHouseConfigManager = {
  initConfig?: () => PromiseLike<string>
}

const manager = ClickHouse as unknown as ClickHouseConfigManager
assert.equal(typeof manager.initConfig, 'function', 'ClickHouse must expose initConfig()')

const temporaryDir = await mkdtemp(join(tmpdir(), 'flyenv-clickhouse-config-'))
try {
  global.Server = { ApacheDir: temporaryDir, ClickHouseDir: temporaryDir }
  const initConfig = manager.initConfig
  assert.ok(initConfig)
  await initConfig.call(manager)

  const configPath = join(temporaryDir, 'config.xml')
  const usersPath = join(temporaryDir, 'users.xml')
  assert.match(await readFile(configPath, 'utf-8'), /<clickhouse>/)
  assert.match(await readFile(usersPath, 'utf-8'), /<users>/)
  assert.match(await readFile(usersPath, 'utf-8'), /<profiles>\s*<default\s*\/>\s*<\/profiles>/)
  assert.match(await readFile(usersPath, 'utf-8'), /<quotas>\s*<default\s*\/>\s*<\/quotas>/)
  assert.match(await readFile(`${configPath}.default`, 'utf-8'), /<clickhouse>/)
  assert.match(await readFile(`${usersPath}.default`, 'utf-8'), /<users>/)

  await writeFile(configPath, '<clickhouse>custom</clickhouse>')
  await initConfig.call(manager)
  assert.equal(
    await readFile(configPath, 'utf-8'),
    '<clickhouse>custom</clickhouse>',
    'initialization must preserve existing config.xml content'
  )

  await writeFile(
    usersPath,
    `<clickhouse>
    <users>
        <default>
            <password></password>
            <networks>
                <ip>::/0</ip>
            </networks>
            <profile>default</profile>
            <quota>default</quota>
        </default>
    </users>
</clickhouse>
`
  )
  await initConfig.call(manager)
  assert.match(
    await readFile(usersPath, 'utf-8'),
    /<profiles>\s*<default\s*\/>\s*<\/profiles>/,
    'initialization must migrate the previous built-in users.xml template'
  )
} finally {
  await rm(temporaryDir, { recursive: true, force: true })
}

assert.match(pageSource, /const ready = ref\(false\)/)
assert.match(pageSource, /IPC\.send\('app-fork:clickhouse', 'initConfig'\)/)
assert.match(pageSource, /v-if="ready"/)
assert.match(pageSource, /module-config h-full overflow-hidden flex flex-col/)
assert.match(pageSource, /app-base-el-card flex-1 overflow-hidden/)
assert.match(pageSource, /@\/components\/Conf\/conf\.vue/)
assert.match(pageSource, /@\/components\/Conf\/tool\.vue/)
assert.match(pageSource, /<ToolVM v-if="conf" :conf="conf" \/>/)

console.log('clickhouse config page regression tests passed')
