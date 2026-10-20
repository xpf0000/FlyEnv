import assert from 'node:assert/strict'
import { test } from 'node:test'
const api = await import('../render/installationsController').catch(() => ({}) as any)
function deps() {
  return {
    list: async () => [],
    installed: async () => {},
    guard: async () => true,
    confirm: async () => true,
    install: async (_row: any, _progress: any) => {},
    remove: async () => {},
    command: async () => {},
    cancel: async () => {},
    cleanup: async () => {},
    notify: () => {}
  }
}
test('installation mutation shares reentry, retains progress, survives view detach and settles cleanup once', async () => {
  const d = deps()
  let release!: () => void,
    calls = 0,
    cleaned = 0
  d.install = async (_row, progress) => {
    calls++
    progress({ progress: 45 })
    await new Promise<void>((r) => (release = r))
  }
  d.cleanup = async () => {
    cleaned++
  }
  const c = new api.InstallationsController(d)
  const row = { name: 'MySQL8.4', version: '8.4.8', source: 'Static', installed: false }
  const first = c.act(row)
  assert.equal(c.act(row), first)
  await new Promise((r) => setTimeout(r, 0))
  assert.equal(c.busy, true)
  assert.equal(c.progress, 45)
  release()
  assert.equal(await first, true)
  assert.equal(c.busy, false)
  assert.equal(calls, 1)
  assert.equal(cleaned, 1)
})
test('uninstall refusal and cancellation never execute a mutation; a failed refresh cannot undo installation', async () => {
  const d = deps()
  let mutated = 0
  d.remove = async () => {
    mutated++
  }
  d.guard = async () => false
  const c = new api.InstallationsController(d)
  assert.equal(await c.act({ name: 'mysql', source: 'Homebrew', installed: true }), false)
  assert.equal(mutated, 0)
  d.guard = async () => true
  d.confirm = async () => false
  assert.equal(await c.act({ name: 'mysql', source: 'Homebrew', installed: true }), false)
  assert.equal(mutated, 0)
  d.installed = async () => {
    throw new Error('refresh unavailable')
  }
  assert.equal(await c.act({ name: 'mysql', source: 'Static', installed: false }), true)
  assert.match(c.warning, /refresh unavailable/)
})
test('a cancelled package execution never reports success and refreshes the actual partial installation state', async () => {
  const d = deps()
  let release!: () => void,
    refreshed = 0
  d.install = async () => {
    await new Promise<void>((r) => (release = r))
  }
  d.cancel = async () => {
    release()
  }
  d.installed = async () => {
    refreshed++
  }
  const c = new api.InstallationsController(d)
  const pending = c.act({ name: 'mysql', source: 'Homebrew', installed: false })
  await new Promise((r) => setTimeout(r, 0))
  await c.cancel()
  assert.equal(await pending, false)
  assert.equal(c.busy, false)
  assert.equal(refreshed, 1)
  assert.match(c.warning, /cancel/i)
})
test('failure after a package mutation still refreshes actual state and clears admission', async () => {
  const d = deps()
  let refreshed = 0
  d.install = async () => {
    throw new Error('package exit 1')
  }
  d.installed = async () => {
    refreshed++
  }
  const c = new api.InstallationsController(d)
  assert.equal(await c.act({ name: 'mysql', source: 'Macports', installed: false }), false)
  assert.match(c.error, /exit 1/)
  assert.equal(refreshed, 1)
  assert.equal(c.busy, false)
})
test('host dialogs that only emit closed settle their owner and dispose once', async () => {
  const { waitForDialog } = await import('../render/dialog')
  let close!: () => void,
    submit!: (value: boolean) => void,
    disposed = 0
  const mount = () => ({
    view: {
      show: true,
      onClosed: (fn: () => void) => {
        close = fn
      },
      onSubmit: (fn: (value: boolean) => void) => {
        submit = fn
      }
    },
    dispose: () => {
      disposed++
    }
  })
  const cancelled = waitForDialog(mount)
  close()
  close()
  assert.equal(await cancelled, undefined)
  assert.equal(disposed, 1)
  const saved = waitForDialog(mount)
  submit(true)
  close()
  assert.equal(await saved, true)
  assert.equal(disposed, 2)
})
test('the original host code=0,data=false installation outcome remains a failure and still refreshes state', async () => {
  const d = deps()
  let refreshed = 0
  d.install = async () => api.requireStaticInstallationSuccess({ code: 0, data: false })
  d.installed = async () => {
    refreshed++
  }
  const c = new api.InstallationsController(d)
  assert.equal(typeof api.requireStaticInstallationSuccess, 'function')
  assert.equal(await c.act({ name: 'MySQL8.4', source: 'Static', installed: false }), false)
  assert.match(c.error, /install/i)
  assert.equal(refreshed, 1)
})
test('cancellation waits for PTY initialization and stops the real key before destroying its view', async () => {
  const api = await import('../render/terminal').catch(() => ({}) as any)
  let release!: () => void,
    destroyed = 0
  const keys: string[] = []
  const terminal = {
    ptyKey: '',
    end: false,
    async mount() {
      await new Promise<void>((r) => (release = r))
      this.ptyKey = 'owned-pty'
    },
    async stop() {
      keys.push(this.ptyKey)
      this.end = true
    },
    destroy() {
      destroyed++
    }
  }
  const session = new api.InstallationTerminal(terminal)
  const mounting = session.mount({})
  const cancelled = session.stop()
  assert.deepEqual(keys, [])
  release()
  await mounting
  await cancelled
  await session.dispose()
  await session.dispose()
  assert.deepEqual(keys, ['owned-pty'])
  assert.equal(destroyed, 1)
})
