import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const sourcePath = path.resolve(process.cwd(), 'src/main/core/IPCHandler.ts')
const source = fs.readFileSync(sourcePath, 'utf8')
const handlerMatch = source.match(
  /private handleHelperInstall\(command: string, key: string\) \{(?<body>[\s\S]*?)\n  \}/
)

assert.ok(handlerMatch?.groups?.body, 'handleHelperInstall body must exist')
const handlerBody = handlerMatch.groups.body

assert.doesNotMatch(handlerBody, /\.catch\(\)\s*\.finally/)
assert.match(handlerBody, /\.then\(\(\) => this\.sendToMainWindow\(command, key, \{ code: 0, data: true \}\)\)/)
assert.match(handlerBody, /\.catch\(\(error\) => this\.sendToMainWindow\(command, key, buildHelperCheckResponse\(error\)\)\)/)

console.log('windows-helper-install-ipc-test: ok')
