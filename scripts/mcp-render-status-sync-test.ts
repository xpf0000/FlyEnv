#!/usr/bin/env node

import assert from 'node:assert/strict'
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

  console.log('mcp render status sync tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
