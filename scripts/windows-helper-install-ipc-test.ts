import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const sourcePath = path.resolve(process.cwd(), 'src/main/core/IPCHandler.ts')
const source = fs.readFileSync(sourcePath, 'utf8')
const helperStorePath = path.resolve(process.cwd(), 'src/render/store/helper.ts')
const helperStoreSource = fs.readFileSync(helperStorePath, 'utf8')
const globalIpcPath = path.resolve(process.cwd(), 'src/render/util/GlobalIPCOn.ts')
const globalIpcSource = fs.readFileSync(globalIpcPath, 'utf8')
const handlerMatch = source.match(
  /private handleHelperInstall\(command: string, key: string\) \{(?<body>[\s\S]*?)\n  \}/
)

assert.ok(handlerMatch?.groups?.body, 'handleHelperInstall body must exist')
const handlerBody = handlerMatch.groups.body

assert.doesNotMatch(handlerBody, /\.catch\(\)\s*\.finally/)
assert.match(handlerBody, /\.then\(\(\) => this\.sendToMainWindow\(command, key, \{ code: 0, data: true \}\)\)/)
assert.match(handlerBody, /\.catch\(\(error\) => this\.sendToMainWindow\(command, key, buildHelperCheckResponse\(error\)\)\)/)
assert.match(helperStoreSource, /private installResultPending = false/)
assert.match(
  helperStoreSource,
  /IPC\.send\('APP-FlyEnv-Helper-Install'\)\.then\(\(key: string, res: any\) =>/
)
assert.match(helperStoreSource, /this\.handleInstallResult\(res\)/)
assert.match(helperStoreSource, /res\?\.stderr/)
assert.match(globalIpcSource, /!HelperStore\.isInstallResultPending\(\)/)

console.log('windows-helper-install-ipc-test: ok')
