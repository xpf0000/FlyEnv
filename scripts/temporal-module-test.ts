import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildServerStartArgs,
  buildServerYaml,
  buildUiYaml,
  normalizePath,
  serverEnvName
} from '../src/fork/module/Temporal/util'

// Windows 反斜杠路径归一化为正斜杠（避免 yaml 转义问题）
assert.equal(
  normalizePath('E:\\FlyEnv-Data\\server\\temporal\\data'),
  'E:/FlyEnv-Data/server/temporal/data'
)
assert.equal(normalizePath('/Users/x/flyenv/temporal/data'), '/Users/x/flyenv/temporal/data')

// server yaml：SQLite 双库路径内插 + 关键端口
const yaml = buildServerYaml('E:\\FlyEnv-Data\\server\\temporal\\data')
assert.ok(yaml.includes('databaseName: "E:/FlyEnv-Data/server/temporal/data/default.db"'))
assert.ok(yaml.includes('databaseName: "E:/FlyEnv-Data/server/temporal/data/visibility.db"'))
assert.ok(yaml.includes('grpcPort: 7233'))
assert.ok(yaml.includes('httpPort: 7243'))
assert.ok(yaml.includes('setup: true'))
assert.ok(yaml.includes('rpcAddress: "127.0.0.1:7233"'))

// ui yaml：默认 8233 指向 7233
const uiYaml = buildUiYaml()
assert.ok(uiYaml.includes('temporalGrpcAddress: 127.0.0.1:7233'))
assert.ok(uiYaml.includes('port: 8233'))
assert.ok(uiYaml.includes('enableUi: true'))

// env 名 = 配置文件名主体
assert.equal(serverEnvName('1.31.1'), 'temporal-v1.31.1')

const configDir = 'E:\\FlyEnv-Data\\server\\temporal\\config'
assert.deepEqual(buildServerStartArgs(configDir, '1.31.2'), [
  '-c',
  configDir,
  '-e',
  'temporal-v1.31.2',
  'start'
])
assert.ok(!buildServerStartArgs(configDir, '1.31.2').includes('-r'))

const temporalForkSource = readFileSync(
  new URL('../src/fork/module/Temporal/index.ts', import.meta.url),
  'utf8'
)
assert.match(temporalForkSource, /startUiServer\(version: SoftInstalled\)/)
assert.match(temporalForkSource, /isUiServerRunning\(\)/)
assert.doesNotMatch(temporalForkSource, /_startServer\(version: SoftInstalled, uiFlag\?: string\)/)
assert.doesNotMatch(temporalForkSource, /\['-r', '\/', '-c', configDir/)

const temporalConfigSource = readFileSync(
  new URL('../src/render/components/Temporal/Config.vue', import.meta.url),
  'utf8'
)
assert.match(temporalConfigSource, /module-config h-full overflow-hidden flex flex-col/)
assert.match(temporalConfigSource, /app-base-el-card flex-1 overflow-hidden/)
assert.match(temporalConfigSource, /import ConfVM from '@\/components\/Conf\/conf.vue'/)
assert.match(temporalConfigSource, /import ToolVM from '@\/components\/Conf\/tool.vue'/)

const temporalIndexSource = readFileSync(
  new URL('../src/render/components/Temporal/Index.vue', import.meta.url),
  'utf8'
)
assert.match(temporalIndexSource, /v-if="isRunning" #tool-left/)
assert.match(temporalIndexSource, /uiState/)
assert.match(temporalIndexSource, /fetchUiLatest/)
assert.match(temporalIndexSource, /installUiLatest/)
assert.match(temporalIndexSource, /startUiServer/)
assert.match(temporalIndexSource, /http.svg/)
assert.doesNotMatch(temporalIndexSource, /TemporalSetup|uiEnabled|base\.install/)

const temporalAsideSource = readFileSync(
  new URL('../src/render/components/Temporal/aside.vue', import.meta.url),
  'utf8'
)
assert.doesNotMatch(temporalAsideSource, /TemporalSetup|startExtParam/)

console.log('ALL CHECKS PASSED')
