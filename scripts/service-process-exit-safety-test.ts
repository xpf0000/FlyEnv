import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  applyServiceProcessCommandSnapshots,
  ownedServicePids,
  type ServiceProcessItem
} from '../src/main/core/ServiceProcess'
import type { SoftInstalled } from '../src/shared/app'
import type { PItem } from '../src/shared/Process'

const serviceBin = '/Users/x/Library/PhpWebStudy/app/nginx-1.28.0/sbin/nginx'
const phpFpmBin = '/Users/x/Library/PhpWebStudy/app/static-php-8.5.8/sbin/php-fpm'
const codexBin =
  '/Users/x/Library/PhpWebStudy/app/nodejs/v24.14.0/lib/node_modules/@openai/codex/bin/codex'
const nginxCommand = `${serviceBin} -c /Users/x/Library/PhpWebStudy/server/nginx/conf/nginx.conf`
const phpFpmCommand =
  'php-fpm: master process (/Users/x/Library/PhpWebStudy/server/php/85/conf/php-fpm.conf)'

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

const phpFpmItem: SoftInstalled = {
  typeFlag: 'php',
  version: '8.5.8',
  bin: phpFpmBin,
  path: '/Users/x/Library/PhpWebStudy/app/static-php-8.5.8',
  num: 85,
  enable: true,
  run: true,
  running: true
}

const processList: PItem[] = [
  {
    USER: 'x',
    PID: '4100',
    PPID: '1',
    COMMAND: nginxCommand
  },
  { USER: 'x', PID: '4101', PPID: '4100', COMMAND: 'nginx: worker process' },
  { USER: 'x', PID: '6200', PPID: '1', COMMAND: phpFpmCommand },
  { USER: 'x', PID: '6201', PPID: '6200', COMMAND: 'php-fpm: pool www' },
  {
    USER: 'x',
    PID: '5200',
    PPID: '1',
    COMMAND: `${codexBin} resume --last`
  }
]

const serviceItems: ServiceProcessItem[] = [
  {
    pid: '4100',
    item: serviceItem('/Users/x/Library/PhpWebStudy/app/nginx-1.28.0'),
    command: nginxCommand
  },
  { pid: '6200', item: phpFpmItem, command: phpFpmCommand },
  {
    pid: '5200',
    item: serviceItem('/Users/x/Library/PhpWebStudy/app'),
    command: nginxCommand
  }
]

assert.deepEqual(
  ownedServicePids(serviceItems, processList).sort(),
  ['4100', '4101', '6200', '6201']
)

const snapshotItems: ServiceProcessItem[] = [
  { pid: '4100', item: serviceItem('/Users/x/Library/PhpWebStudy/app/nginx-1.28.0') },
  { pid: '6200', item: phpFpmItem },
  { pid: '5200', item: serviceItem('/Users/x/Library/PhpWebStudy/app') }
]

applyServiceProcessCommandSnapshots(snapshotItems, new Set(['4100', '6200']), processList)

assert.equal(snapshotItems[0].command, nginxCommand)
assert.equal(snapshotItems[1].command, phpFpmCommand)
assert.equal(snapshotItems[2].command, undefined)

const serviceProcessSource = readFileSync(
  new URL('../src/main/core/ServiceProcess.ts', import.meta.url),
  'utf8'
)
assert.match(serviceProcessSource, /ownedServicePids\(/)
assert.match(serviceProcessSource, /COMMAND_SNAPSHOT_DELAY\s*=\s*2_000/)
assert.doesNotMatch(serviceProcessSource, /stopAllProcessByName/)

console.log('service-process-exit-safety-test: ok')
