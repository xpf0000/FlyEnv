#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { syncServiceStatusFromMcp } from '../src/render/util/mcpServiceStatus'

function makeInstalled(version: string, baseDir: string) {
  return {
    typeFlag: 'nginx',
    version,
    bin: `${baseDir}/nginx-${version}/nginx.exe`,
    path: `${baseDir}/nginx-${version}`,
    enable: true,
    run: false,
    running: false,
    pid: '',
    num: Number(version.split('.').slice(0, 2).join(''))
  }
}

async function main() {
  const baseDir = 'E:/FlyEnv/data/app'
  const installed = [makeInstalled('1.29.0', baseDir), makeInstalled('1.31.2', baseDir)]
  const current = {
    version: '1.29.0',
    bin: `${baseDir}/nginx-1.29.0/nginx.exe`,
    path: `${baseDir}/nginx-1.29.0`
  }

  const nextCurrent = syncServiceStatusFromMcp({
    current,
    installed,
    isOnlyRunOne: true,
    instances: [
      {
        bin: `${baseDir}/nginx-1.31.2/nginx.exe`,
        pid: '1234',
        version: '1.31.2'
      }
    ]
  })

  assert.equal(
    nextCurrent?.version,
    '1.31.2',
    'single-instance MCP status sync should switch current version to the running instance'
  )
  assert.equal(
    installed.find((item) => item.version === '1.31.2')?.run,
    true,
    'running instance should be marked run=true'
  )
  assert.equal(
    installed.find((item) => item.version === '1.29.0')?.run,
    false,
    'previous current version should be marked run=false'
  )

  const stopping = makeInstalled('8.2.18', 'E:/FlyEnv/data/php')
  stopping.run = false
  stopping.running = true
  stopping.pid = '18516'

  syncServiceStatusFromMcp({
    installed: [stopping],
    instances: [
      {
        bin: stopping.bin,
        path: stopping.path,
        version: stopping.version,
        pid: '18516'
      }
    ]
  })

  assert.deepEqual(
    { run: stopping.run, running: stopping.running, pid: stopping.pid },
    { run: false, running: true, pid: '18516' },
    'main-process status must not overwrite a locally stopping version'
  )

  const starting = makeInstalled('8.3.0', 'E:/FlyEnv/data/php')
  starting.run = false
  starting.running = true

  syncServiceStatusFromMcp({
    installed: [starting],
    instances: []
  })

  assert.deepEqual(
    { run: starting.run, running: starting.running, pid: starting.pid },
    { run: false, running: true, pid: '' },
    'empty main-process status must not clear a locally starting version state'
  )

  const ipcHandlerSource = readFileSync(
    new URL('../src/main/core/IPCHandler.ts', import.meta.url),
    'utf8'
  )
  const lifecycleResponse = ipcHandlerSource.indexOf(
    'this.deps.windowManager.sendCommandTo(win, command, key, info)'
  )
  assert.ok(
    ipcHandlerSource.indexOf('ServiceProcessManager.addPid') < lifecycleResponse,
    'start PID registration must happen before the lifecycle response'
  )
  assert.ok(
    ipcHandlerSource.indexOf('ServiceProcessManager.delPid') < lifecycleResponse,
    'stop PID removal must happen before the lifecycle response'
  )
  assert.doesNotMatch(ipcHandlerSource, /APP-Service-Status|serviceStatus/)

  const mcpSource = readFileSync(new URL('../src/render/util/MCP.ts', import.meta.url), 'utf8')
  assert.match(mcpSource, /syncServiceStatusFromMcp\(\{/)
  assert.doesNotMatch(mcpSource, /ServiceStatusCoordinator/)

  const installedItemSource = readFileSync(
    new URL('../src/render/core/Module/ModuleInstalledItem.ts', import.meta.url),
    'utf8'
  )
  assert.doesNotMatch(installedItemSource, /APP-Service-Status|ServiceStatusCoordinator/)

  const installedStopSource = installedItemSource.slice(
    installedItemSource.indexOf('stop(): Promise<string | boolean>'),
    installedItemSource.indexOf('restart()')
  )
  assert.ok(
    installedStopSource.indexOf('if (res?.code === 200) return') >= 0 &&
      installedStopSource.indexOf('if (res?.code === 200) return') <
        installedStopSource.indexOf('IPC.off(key)'),
    'stop progress responses must not complete the local lifecycle operation'
  )
  assert.match(
    installedStopSource,
    /resolve\(res\?\.msg \?\? 'Operation failed'\)/,
    'a terminal stop failure must propagate the module execution result'
  )

  const installedServiceDoSource = installedItemSource.slice(
    installedItemSource.indexOf("serviceDo(flag: 'stop' | 'start' | 'restart')"),
    installedItemSource.indexOf('setEnv(): Promise<string | boolean>')
  )
  assert.doesNotMatch(
    installedServiceDoSource,
    /this\.(?:run|running)\s*=/,
    'ModuleInstalledItem.serviceDo must not overwrite lifecycle-owned final state'
  )

  const serviceManagerSetupSource = readFileSync(
    new URL('../src/render/components/ServiceManager/setup.ts', import.meta.url),
    'utf8'
  )
  const serviceManagerCompletionSource = serviceManagerSetupSource.slice(
    serviceManagerSetupSource.indexOf(
      "const serviceDo = (flag: 'stop' | 'start' | 'restart' | 'reload'"
    ),
    serviceManagerSetupSource.indexOf('let CustomPathVM')
  )
  assert.doesNotMatch(
    serviceManagerCompletionSource,
    /(?:item|currentVersion\.value)\.(?:run|running)\s*=/,
    'ServiceManager completion must leave final service state to lifecycle code'
  )

  console.log('mcp render status sync tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
