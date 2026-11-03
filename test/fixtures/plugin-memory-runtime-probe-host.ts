import { app, utilityProcess } from 'electron'
import { writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const [workerFile, dataRoot, resultFile, mode] = process.argv.slice(2)
app.setPath('userData', join(dataRoot, 'probe-user-data'))
app.disableHardwareAcceleration()
void app.whenReady().then(async () => {
  const children: ReturnType<typeof utilityProcess.fork>[] = []
  const exited = new Map<ReturnType<typeof utilityProcess.fork>, Promise<void>>()
  async function start(crashAt?: string) {
    const child = utilityProcess.fork(workerFile, [dataRoot, ...(crashAt ? [crashAt] : [])], {
      stdio: 'pipe'
    })
    children.push(child)
    exited.set(child, new Promise((resolve) => child.once('exit', () => resolve())))
    const ready = await new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('worker readiness timeout')), 10_000)
      child.once('message', (value) => {
        clearTimeout(timer)
        resolve(value)
      })
      child.once('error', () => {
        clearTimeout(timer)
        reject(new Error('utility process failed'))
      })
      child.stderr?.on('data', (value) => process.stderr.write(value))
    })
    return { child, ready }
  }
  try {
    const first = await start()
    if (mode === 'orphan-holder') {
      assert.equal(first.ready.acquired, true)
      await writeFile(resultFile, JSON.stringify(first.ready))
      setInterval(() => {}, 1000)
      return
    }
    if (mode === 'try-once') {
      await writeFile(resultFile, JSON.stringify(first.ready))
      if (first.ready.acquired) first.child.postMessage('close')
      await exited.get(first.child)
      app.exit(0)
      return
    }
    assert.equal(first.ready.acquired, true)
    const second = await start()
    assert.deepEqual(second.ready, { acquired: false, code: 'owner_busy' })
    await exited.get(second.child)
    first.child.kill()
    await exited.get(first.child)
    const third = await start()
    assert.equal(third.ready.acquired, true)
    assert.deepEqual(JSON.parse(await readFile(join(dataRoot, 'probe.json'), 'utf8')), {
      complete: true
    })
    third.child.postMessage('close')
    await exited.get(third.child)
    for (const point of ['write', 'sync', 'rename']) {
      await writeFile(join(dataRoot, 'crash.json'), '{"revision":1}')
      const crashing = await start(point)
      assert.equal(crashing.ready.acquired, true)
      await exited.get(crashing.child)
      assert.deepEqual(JSON.parse(await readFile(join(dataRoot, 'crash.json'), 'utf8')), {
        revision: point === 'rename' ? 2 : 1
      })
    }
    await writeFile(
      resultFile,
      JSON.stringify(
        {
          passed: true,
          platform: process.platform,
          arch: process.arch,
          versions: first.ready,
          checks: [
            'contending utilityProcess rejected',
            'kernel lease released after killed worker exit',
            'atomic replacement and directory sync in utilityProcess',
            'graceful close exit',
            'SIGKILL at write/sync/rename leaves complete old/new record'
          ]
        },
        null,
        2
      )
    )
    app.exit(0)
  } catch (error) {
    await writeFile(resultFile, JSON.stringify({ passed: false, error: String(error) }))
    for (const child of children) child.kill()
    app.exit(1)
  }
})
