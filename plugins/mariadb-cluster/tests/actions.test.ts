import assert from 'node:assert/strict'
import { test } from 'node:test'
import { InstanceActionController } from '../render/actionsController'
import type { InstanceSpec } from '../shared'
const instance = { id: 'a', port: 13307, socket: '/tmp/mariadb-a.sock' } as InstanceSpec

test('connection click snapshots endpoint, shares in-flight copy, and confirms after clipboard completion', async () => {
  let finish!: () => void
  const copied: string[] = [],
    notices: unknown[] = []
  const controller = new InstanceActionController({
    copy: async (text) => {
      copied.push(text)
      await new Promise<void>((resolve) => {
        finish = resolve
      })
    },
    open: async () => {},
    copied: () => 'Copied',
    notify: (...args) => {
      notices.push(args)
    }
  })
  const item = { ...instance }
  const one = controller.copyConnection(item)
  item.port = 9999
  assert.equal(controller.copyConnection(item), one)
  await Promise.resolve()
  assert.deepEqual(notices, [])
  assert.equal(copied[0], 'Host: 127.0.0.1\nPort: 13307\nSocket: /tmp/mariadb-a.sock\nUser: root')
  finish()
  await one
  assert.deepEqual(notices, [['success', 'Copied']])
})
test('clipboard rejection shows an error and allows a later retry', async () => {
  let calls = 0
  const notices: unknown[] = []
  const controller = new InstanceActionController({
    copy: async () => {
      if (++calls === 1) throw new Error('Clipboard unavailable')
    },
    open: async () => {},
    copied: () => 'Copied',
    notify: (...args) => {
      notices.push(args)
    }
  })
  await controller.copyConnection(instance)
  await controller.copyConnection(instance)
  assert.deepEqual(notices, [
    ['error', 'Clipboard unavailable'],
    ['success', 'Copied']
  ])
})
test('Socket click copies only the captured address, shares duplicates and confirms after completion', async () => {
  let finish!: () => void
  const copies: string[] = [],
    notices: unknown[] = []
  const controller = new InstanceActionController({
    copy: async (text) => {
      copies.push(text)
      await new Promise<void>((resolve) => {
        finish = resolve
      })
    },
    open: async () => {},
    copied: () => 'Copied',
    notify: (...args) => {
      notices.push(args)
    }
  })
  const item = { ...instance }
  const pending = controller.copySocket(item)
  item.socket = '/tmp/changed.sock'
  assert.equal(controller.copySocket(item), pending)
  await Promise.resolve()
  assert.deepEqual(copies, ['/tmp/mariadb-a.sock'])
  assert.deepEqual(notices, [])
  finish()
  await pending
  assert.deepEqual(notices, [['success', 'Copied']])
})
test('panel opening is shared through close, then permits reopening', async () => {
  let close!: () => void,
    calls = 0
  const controller = new InstanceActionController({
    copy: async () => {},
    copied: () => 'Copied',
    notify: () => {},
    open: async () => {
      calls++
      await new Promise<void>((resolve) => {
        close = resolve
      })
    }
  })
  const one = controller.open('a', 'config')
  assert.equal(controller.open('a', 'config'), one)
  await Promise.resolve()
  assert.equal(calls, 1)
  close()
  await one
  const two = controller.open('a', 'config')
  await Promise.resolve()
  assert.equal(calls, 2)
  close()
  await two
})
