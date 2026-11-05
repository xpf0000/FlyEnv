import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { DataRootLease } from '../../src/fork/runtime/DataRootLease'

if (process.argv[3] === 'worker') {
  await DataRootLease.acquire(process.argv[2])
  process.send?.({ pid: process.pid })
  setInterval(() => {}, 1000)
} else {
  const worker = fork(fileURLToPath(import.meta.url), [process.argv[2], 'worker'], {
    execArgv: ['--import', 'tsx'],
    stdio: ['ignore', 'ignore', 'inherit', 'ipc']
  })
  worker.once('message', (message) => process.send?.(message))
}
