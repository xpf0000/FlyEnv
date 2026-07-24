import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ownedServicePids } from '../src/main/core/ServiceProcess'
import type { SoftInstalled } from '../src/shared/app'
import type { PItem } from '../src/shared/Process'

const serviceBin = '/Users/x/Library/PhpWebStudy/app/nginx-1.28.0/sbin/nginx'
const codexBin =
  '/Users/x/Library/PhpWebStudy/app/nodejs/v24.14.0/lib/node_modules/@openai/codex/bin/codex'

const serviceItem = (path: string): SoftInstalled => ({
  typeFlag: 'nginx',
  version: '1.28.0',
  bin: serviceBin,
  path,
  num: null,
  enable: true,
  run: true,
  running: true
})

const processList: PItem[] = [
  {
    USER: 'x',
    PID: '4100',
    PPID: '1',
    COMMAND: `${serviceBin} -c /Users/x/Library/PhpWebStudy/server/nginx/conf/nginx.conf`
  },
  { USER: 'x', PID: '4101', PPID: '4100', COMMAND: 'nginx: worker process' },
  {
    USER: 'x',
    PID: '5200',
    PPID: '1',
    COMMAND: `${codexBin} resume --last`
  }
]

assert.deepEqual(
  ownedServicePids(
    [
      { pid: '4100', item: serviceItem('/Users/x/Library/PhpWebStudy/app/nginx-1.28.0') },
      {
        pid: '5200',
        item: serviceItem('/Users/x/Library/PhpWebStudy/app')
      }
    ],
    processList
  ).sort(),
  ['4100', '4101']
)

const serviceProcessSource = readFileSync(
  new URL('../src/main/core/ServiceProcess.ts', import.meta.url),
  'utf8'
)
assert.match(serviceProcessSource, /ownedServicePids\(/)
assert.doesNotMatch(serviceProcessSource, /stopAllProcessByName/)

console.log('service-process-exit-safety-test: ok')
