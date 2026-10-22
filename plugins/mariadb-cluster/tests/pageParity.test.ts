import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reactive } from 'vue'
import {
  InstallationsController,
  type InstallationDependencies
} from '../render/installationsController'
import { waitForSharedBackup } from '../render/backup'

const dependencies = (install: () => Promise<unknown>): InstallationDependencies => ({
  list: async () => [],
  installed: async () => undefined,
  guard: async () => true,
  confirm: async () => true,
  install,
  remove: async () => undefined,
  cancel: async () => undefined,
  cleanup: async () => undefined,
  notify: () => undefined
})

test('package terminal presentation remains owned across detach and terminal until confirmation', async () => {
  let finish!: () => void
  const controller = new InstallationsController(
    dependencies(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
  )
  const result = controller.act({ name: 'mariadb@10.11', source: 'Homebrew', installed: false })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(controller.taskVisible, true)
  assert.equal(controller.confirmTask(), false)
  controller.output = 'installed successfully'
  finish()
  assert.equal(await result, true)
  assert.equal(controller.busy, false)
  assert.equal(controller.taskVisible, true)
  assert.equal(controller.output, 'installed successfully')
  assert.equal(controller.confirmTask(), true)
  assert.equal(controller.taskVisible, false)
  await controller.act({ name: 'mariadb.zip', source: 'Static', installed: true })
  assert.equal(controller.taskVisible, false)
})

test('native backup terminal state settles a legacy pending promise and allows subsequent backups', async () => {
  const busy = reactive<Record<string, boolean>>({})
  const run = () =>
    waitForSharedBackup(busy, '/mariadb/bin/mariadbd', async () => {
      busy['/mariadb/bin/mariadbd'] = true
      await new Promise((resolve) => setImmediate(resolve))
      delete busy['/mariadb/bin/mariadbd']
      return new Promise(() => undefined)
    })
  await run()
  await run()
  assert.equal(busy['/mariadb/bin/mariadbd'], undefined)
})

test('native backup failures before execution still reject their owner', async () => {
  const busy = reactive<Record<string, boolean>>({})
  await assert.rejects(
    waitForSharedBackup(busy, '/mariadb', async () => {
      throw new Error('directory cancelled')
    }),
    /directory cancelled/
  )
  assert.deepEqual(busy, {})
})
