import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CH_UI_PORT,
  chUIAssetName,
  chUIConfigContent,
  chUIReleaseURL,
  clickHouseHttpPort
} from '../src/fork/module/ClickHouse/chUI'

const root = join(import.meta.dirname, '..')
const forkSource = readFileSync(join(root, 'src/fork/module/ClickHouse/index.ts'), 'utf-8')
const pageSource = readFileSync(join(root, 'src/render/components/ClickHouse/Index.vue'), 'utf-8')
const chUiPanelFile = join(root, 'src/render/components/ClickHouse/ChUiPanel.ts')
assert.equal(existsSync(chUiPanelFile), true)
const chUiPanelSource = readFileSync(chUiPanelFile, 'utf-8')

assert.equal(CH_UI_PORT, 3488)
assert.equal(chUIAssetName('darwin', 'arm64'), 'ch-ui-darwin-arm64')
assert.equal(chUIAssetName('darwin', 'x64'), 'ch-ui-darwin-amd64')
assert.equal(chUIAssetName('linux', 'arm64'), 'ch-ui-linux-arm64')
assert.equal(chUIAssetName('linux', 'x64'), 'ch-ui-linux-amd64')
assert.equal(
  chUIReleaseURL('darwin', 'arm64'),
  'https://github.com/caioricciuti/ch-ui/releases/latest/download/ch-ui-darwin-arm64'
)
assert.equal(
  chUIReleaseURL('linux', 'x64'),
  'https://github.com/caioricciuti/ch-ui/releases/latest/download/ch-ui-linux-amd64'
)

assert.equal(clickHouseHttpPort('<clickhouse><http_port>18123</http_port></clickhouse>'), 18123)
assert.equal(clickHouseHttpPort('<clickhouse><http_port>0</http_port></clickhouse>'), 8123)
assert.equal(clickHouseHttpPort('<clickhouse><http_port>invalid</http_port></clickhouse>'), 8123)
assert.equal(clickHouseHttpPort('<clickhouse></clickhouse>'), 8123)
assert.match(
  chUIConfigContent('/tmp/clickhouse/ch-ui/data/ch-ui.db', 'http://127.0.0.1:18123'),
  /database_path: "\/tmp\/clickhouse\/ch-ui\/data\/ch-ui\.db"/
)
assert.match(
  chUIConfigContent('/tmp/clickhouse/ch-ui/data/ch-ui.db', 'http://127.0.0.1:18123'),
  /clickhouse_url: "http:\/\/127\.0\.0\.1:18123"/
)

assert.match(forkSource, /openCHUI\(\): ForkPromise/)
assert.match(forkSource, /await downloadFile\(chUIReleaseURL\(/)
assert.match(forkSource, /serviceStartSpawn\(/)
assert.match(forkSource, /execPromise\(`"\$\{bin\}" version`\)/)
assert.doesNotMatch(forkSource, /execPromise\(`"\$\{bin\}" --version`\)/)
assert.match(forkSource, /join\(this\.chUIDir\(\), 'server\.yaml'\)/)
assert.match(forkSource, /join\(this\.chUIDir\(\), 'ch-ui\.pid'\)/)
assert.match(forkSource, /const res = await serviceStartSpawn\(/)
assert.match(forkSource, /'APP-Service-Start-Item': chUIVersion/)
assert.match(forkSource, /_stopServer\(version: SoftInstalled, \.\.\.args: any\)/)
assert.match(forkSource, /uiPids = await this\._stopCHUI\(\)/)
assert.match(forkSource, /private async _stopCHUI\(\): Promise<string\[\]>/)
assert.match(forkSource, /ProcessKill\('-INT', arr\)/)

const ipcHandlerSource = readFileSync(join(root, 'src/main/core/IPCHandler.ts'), 'utf-8')
assert.match(ipcHandlerSource, /info\.data\?\.\['APP-Service-Start-Item'\] \?\? args\[1\]/)

const baseForkSource = readFileSync(join(root, 'src/fork/module/Base/index.ts'), 'utf-8')
assert.match(
  baseForkSource,
  /const stopped = await this\._stopServer\(version, \.\.\.args\)\.on\(on\)/
)
assert.match(baseForkSource, /res\['APP-Service-Stop-PID'\] = stopped\['APP-Service-Stop-PID'\]/)

const mcpToolsSource = readFileSync(join(root, 'src/main/core/MCPTools.ts'), 'utf-8')
assert.match(
  mcpToolsSource,
  /const stoppedPids: string\[\] = data\?\.\['APP-Service-Stop-PID'\] \?\? \[\]/
)
assert.match(mcpToolsSource, /ServiceProcessManager\.delPid\(flag, stoppedPids\)/)

assert.match(pageSource, /<template v-if="isRunning" #tool-left>/)
assert.match(pageSource, /<el-icon\s+v-if="chUIOpening"\s+class="is-loading"/)
assert.match(pageSource, /<Loading\s*\/>/)
assert.match(pageSource, /<yb-icon\s+v-else/)
assert.match(pageSource, /:disabled="chUIOpening"/)
assert.doesNotMatch(pageSource, /:loading="chUIOpening"/)
assert.match(pageSource, /import chUiPanel from '\.\/ChUiPanel'/)
assert.match(pageSource, /chUiPanel\.open\(\)/)
assert.doesNotMatch(pageSource, /from '@\/util\/IPC'/)
assert.doesNotMatch(pageSource, /WebPanelOpening/)
assert.match(chUiPanelSource, /export class ChUiPanel/)
assert.match(chUiPanelSource, /readonly opening = ref\(false\)/)
assert.match(chUiPanelSource, /IPC\.send\('app-fork:clickhouse', 'openCHUI'\)/)
assert.match(chUiPanelSource, /shell\.openExternal\(res\.data\.url\)/)

console.log('clickhouse CH-UI regression tests passed')
