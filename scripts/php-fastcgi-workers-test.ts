import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DEFAULT_FASTCGI_WORKER_COUNT,
  FastCgiWorkerStore
} from '../src/fork/module/Php.win/FastCgiWorkers'

const tempRoot = mkdtempSync(join(tmpdir(), 'flyenv-php-fastcgi-workers-'))
const settingsFile = join(tempRoot, 'fastcgi-workers.json')

try {
  const store = new FastCgiWorkerStore(settingsFile)
  const php84 = 'C:\\FlyEnv\\PHP\\8.4'
  const php83 = 'C:\\FlyEnv\\PHP\\8.3'

  assert.equal(DEFAULT_FASTCGI_WORKER_COUNT, 4)
  assert.equal(await store.get(php84), 4)

  await store.set(php84, 10)
  assert.equal(await store.get('c:/flyenv/php/8.4/'), 10)
  assert.equal(await store.get(php83), 4)
  assert.deepEqual(JSON.parse(readFileSync(settingsFile, 'utf8')), {
    'c:/flyenv/php/8.4': 10
  })

  await store.set(php83, 7)
  assert.equal(await store.get(php84), 10)
  assert.equal(await store.get(php83), 7)

  await assert.rejects(() => store.set(php84, 0), /between 1 and 64/)
  await assert.rejects(() => store.set(php84, 64.5), /between 1 and 64/)
  assert.equal(await store.get(php84), 10)

  writeFileSync(settingsFile, '{not valid json', 'utf8')
  assert.equal(await store.get(php84), 4)
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}

const phpSource = readFileSync('src/fork/module/Php.win/index.ts', 'utf8')
assert.match(phpSource, /getFastCgiWorkerCount\(version: SoftInstalled\)/)
assert.match(phpSource, /setFastCgiWorkerCount\(version: SoftInstalled, count: number\)/)
assert.match(phpSource, /await this\.fastCgiWorkerStore\(\)\.get\(version\.path\)/)
assert.match(phpSource, /String\(workerCount\)/)

const versionActionsSource = readFileSync('src/render/components/PHP/VersionActions.vue', 'utf8')
const phpFpmIndexSource = readFileSync('src/render/components/PHPFPM/Index.vue', 'utf8')
const phpListSource = readFileSync('src/render/components/PHP/List.vue', 'utf8')
const workerActionPath = 'src/render/components/PHPFPM/FastCgiWorkersAction.vue'
const workerDialogPath = 'src/render/components/PHPFPM/FastCgiWorkers.vue'
assert.equal(existsSync(workerDialogPath), true)
assert.equal(existsSync(workerActionPath), true)
const workerActionSource = readFileSync(workerActionPath, 'utf8')
const workerDialogSource = readFileSync(workerDialogPath, 'utf8')
assert.doesNotMatch(versionActionsSource, /fastcgiWorkers/)
assert.match(phpFpmIndexSource, /FastCgiWorkersAction/)
assert.match(phpFpmIndexSource, /<template #action="\{ item \}">/)
assert.match(phpListSource, /<slot name="action" :item="scope\.row"><\/slot>/)
assert.match(workerActionSource, /v-if="isWindows"/)
assert.match(workerActionSource, /I18nT\('php\.fastcgiWorkers'\)/)
assert.match(workerActionSource, /getFastCgiWorkerCount/)
assert.match(workerActionSource, /FastCgiWorkersVM/)
assert.match(workerActionSource, /AsyncComponentShow\(FastCgiWorkersVM/)
assert.match(workerActionSource, /const showFastCgiWorkers = async \(\) =>/)
assert.match(workerActionSource, /await fetchFastCgiWorkerCount\(\)/)
assert.match(
  workerActionSource,
  /const FastCgiWorkersVM = \(await import\('\.\/FastCgiWorkers\.vue'\)\)\.default/
)
assert.doesNotMatch(workerActionSource, /await AsyncComponentShow\(FastCgiWorkersVM/)
assert.match(workerDialogSource, /el-input-number/)
assert.match(workerDialogSource, /MIN_FASTCGI_WORKER_COUNT = 1/)
assert.match(workerDialogSource, /MAX_FASTCGI_WORKER_COUNT = 64/)
assert.match(workerDialogSource, /setFastCgiWorkerCount/)
assert.match(workerDialogSource, /props\.version\.restart\(\)/)

const mcpToolsSource = readFileSync('src/main/core/MCPTools.ts', 'utf8')
const startupGroupSource = readFileSync(
  'src/render/components/StartupGroup/class/StartupGroupRuntime.ts',
  'utf8'
)
const asideSource = readFileSync('src/render/components/Aside/Index.vue', 'utf8')
assert.match(mcpToolsSource, /callFork\(this\.forkManager, flag, 'startService', v\)/)
assert.match(startupGroupSource, /target\.start\(\)/)
assert.match(asideSource, /const doAutoStart = \(\) => \{[\s\S]*?groupDo\(\)/)

console.log('php-fastcgi-workers-test: ok')
