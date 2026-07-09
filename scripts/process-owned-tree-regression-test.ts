import assert from 'node:assert/strict'
import { ProcessOwnedPidsByPid, type PItem } from '../src/shared/Process'

const flyEnvBaseDir = '/Users/test/Library/FlyEnv/server'
const flyEnvAppDir = '/Users/test/Library/FlyEnv/app'
const phpBin = `${flyEnvAppDir}/static-php-8.4.10/sbin/php-fpm`

const processList: PItem[] = [
  {
    USER: 'user',
    PID: '4200',
    PPID: '1',
    COMMAND: `${phpBin} --fpm-config ${flyEnvBaseDir}/php/84/conf/php-fpm.conf`
  },
  {
    USER: 'user',
    PID: '4201',
    PPID: '4200',
    COMMAND: 'php-fpm: pool www'
  },
  {
    USER: 'user',
    PID: '5100',
    PPID: '1',
    COMMAND: '/Applications/Visual Studio Code.app/Contents/MacOS/Electron .'
  },
  {
    USER: 'user',
    PID: '5101',
    PPID: '5100',
    COMMAND:
      '/Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper (Renderer).app/Contents/MacOS/Code Helper (Renderer) --type=renderer'
  },
  {
    USER: 'user',
    PID: '6101',
    PPID: '6100',
    COMMAND:
      '/Applications/FlyEnv.app/Contents/Frameworks/FlyEnv Helper (Renderer).app/Contents/MacOS/FlyEnv Helper (Renderer) --type=renderer'
  }
]

assert.deepEqual(
  ProcessOwnedPidsByPid('4200', processList, [phpBin, flyEnvBaseDir, flyEnvAppDir]).sort(),
  ['4200', '4201']
)

assert.deepEqual(ProcessOwnedPidsByPid('5100', processList, [phpBin, flyEnvBaseDir, flyEnvAppDir]), [])

assert.deepEqual(ProcessOwnedPidsByPid('6100', processList, [phpBin, flyEnvBaseDir, flyEnvAppDir]), [])

console.log('process-owned-tree-regression-test: ok')
