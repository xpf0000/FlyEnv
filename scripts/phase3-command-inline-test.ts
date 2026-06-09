import assert from 'node:assert/strict'

import { buildCodeRunInlineScript } from '../src/fork/module/Code/index'
import { buildUnixCustomerServiceStartScript } from '../src/fork/util/ServiceStart'
import { buildWindowsTerminalInlineScript } from '../src/shared/WindowsTerminal'

const hasNode = (file: string) => /node(?:\.exe)?$/i.test(file)
const hasBun = (file: string) => /bun(?:\.exe)?$/i.test(file)

const jsWindows = buildCodeRunInlineScript({
  type: 'javascript',
  runtimePath: 'C:\\FlyEnv\\node',
  sourceFile: 'C:\\FlyEnv Cache\\main.js',
  runDir: 'C:\\FlyEnv Cache',
  platform: 'win32',
  exists: hasNode
})
assert.ok(jsWindows.includes('$env:PATH'))
assert.ok(jsWindows.includes('node "C:\\FlyEnv Cache\\main.js"'))
assert.ok(!jsWindows.includes('Unblock-File'))
assert.ok(!jsWindows.includes('.ps1'))

const typescriptUnix = buildCodeRunInlineScript({
  type: 'typescript',
  runtimePath: '/opt/flyenv/node',
  sourceFile: '/tmp/flyenv cache/main.ts',
  runDir: '/tmp/flyenv cache',
  platform: 'darwin',
  exists: hasNode
})
assert.ok(typescriptUnix.includes('export PATH="/opt/flyenv/node/bin:/opt/flyenv/node:$PATH"'))
assert.ok(typescriptUnix.includes('tsx "/tmp/flyenv cache/main.ts"'))
assert.ok(!typescriptUnix.includes('.sh'))

const bunWindows = buildCodeRunInlineScript({
  type: 'javascript',
  runtimePath: 'C:\\FlyEnv\\bun',
  sourceFile: 'C:\\FlyEnv Cache\\main.js',
  runDir: 'C:\\FlyEnv Cache',
  platform: 'win32',
  exists: hasBun
})
assert.ok(bunWindows.includes('bun run "C:\\FlyEnv Cache\\main.js"'))

const customerCommand = buildUnixCustomerServiceStartScript({
  env: 'export PATH="/opt/flyenv/bin:$PATH"',
  cwd: '/tmp/flyenv project',
  commandType: 'command',
  command: 'npm run dev',
  commandFile: '',
  outFile: '/tmp/flyenv out.log',
  errFile: '/tmp/flyenv err.log',
  shell: 'bash'
})
assert.ok(customerCommand.includes('cd "/tmp/flyenv project"'))
assert.ok(customerCommand.includes("nohup bash -lc 'npm run dev'"))
assert.ok(customerCommand.includes('> "/tmp/flyenv out.log" 2>"/tmp/flyenv err.log" &'))
assert.ok(!customerCommand.includes('.start.sh'))
assert.ok(!customerCommand.includes('start-'))

const customerFile = buildUnixCustomerServiceStartScript({
  env: '',
  cwd: '/tmp/flyenv project',
  commandType: 'file',
  command: '',
  commandFile: '/tmp/flyenv project/run.sh',
  outFile: '/tmp/flyenv out.log',
  errFile: '/tmp/flyenv err.log',
  shell: 'zsh'
})
assert.ok(customerFile.includes('nohup "/tmp/flyenv project/run.sh"'))
assert.ok(!customerFile.includes('.start.sh'))

const terminalScript = buildWindowsTerminalInlineScript("Write-Output 'FlyEnv terminal ok'")
assert.ok(terminalScript.includes('Start-Process'))
assert.ok(terminalScript.includes('-EncodedCommand'))
assert.ok(!/['"]-File['"]/.test(terminalScript))
assert.ok(!terminalScript.includes('exec-by-terminal.ps1'))
assert.ok(!terminalScript.includes('command-'))

console.log('phase3 command inline tests passed')
