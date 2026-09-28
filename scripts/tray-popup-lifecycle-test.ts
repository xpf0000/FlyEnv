import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { transformSync } from 'esbuild'

class PopupWindow extends EventEmitter {
  visible = false
  focused = false
  destroyed = false
  nonce = 0
  webContents = {
    send: (_channel: string, _command: string, _key: string, payload: { nonce: number }) => {
      this.nonce = payload.nonce
    }
  }
  isDestroyed() {
    return this.destroyed
  }
  isFocused() {
    return this.focused
  }
  setBounds() {}
  setAlwaysOnTop() {}
  moveTop() {}
  show() {
    this.visible = true
    this.focused = true
  }
  blur() {
    this.focused = false
    this.emit('blur', { preventDefault() {} })
  }
  hide() {
    this.visible = false
  }
}

const loadClass = (filename: string, require: (id: string) => unknown, timers: object = {}) => {
  const code = transformSync(readFileSync(filename, 'utf8'), {
    loader: 'ts',
    format: 'cjs'
  }).code
  const module = { exports: {} as { default: any } }
  runInNewContext(code, {
    module,
    exports: module.exports,
    require,
    console,
    global: { __static: '/test' },
    __static: '/test',
    ...timers
  })
  return module.exports.default
}

const setup = (windows = false) => {
  const timers = new Map<number, { callback: () => void; delay: number }>()
  let nextTimer = 0
  const tray = new EventEmitter()
  const image = { resize: () => image }
  Object.assign(tray, {
    setToolTip() {},
    setContextMenu() {},
    destroy() {},
    getBounds: () => ({ x: 500, y: 0, width: 24, height: 24 })
  })
  const electron = {
    Tray: function () {
      return tray
    },
    nativeImage: { createFromPath: () => image },
    screen: {
      getDisplayNearestPoint: () => ({
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 24, width: 1920, height: 1056 }
      })
    }
  }
  const Manager = loadClass(
    'src/main/ui/TrayManager.ts',
    (id) => {
      if (id === 'events') return { EventEmitter }
      if (id === 'path') return path
      if (id === 'electron') return electron
      if (id === '@shared/utils') return { isWindows: () => windows }
      if (id === '@lang/runtime') return { I18nT: (key: string) => key }
      if (id === '../core/Logger') return { default: { info() {} } }
      throw new Error(`Unexpected dependency: ${id}`)
    },
    {
      setTimeout: (callback: () => void, delay: number) => {
        timers.set(++nextTimer, { callback, delay })
        return nextTimer
      },
      clearTimeout: (id: number) => timers.delete(id)
    }
  )
  const manager = new Manager()
  const win = new PopupWindow()
  manager.attachWindow(win)
  const settle = () => {
    for (const [id, timer] of [...timers]) {
      timers.delete(id)
      timer.callback()
    }
  }
  const open = async () => {
    const pending = manager.openPopup(400, 24, 'down', 15)
    manager.notifyLayoutApplied(win.nonce)
    await pending
  }
  return { manager, win, tray, timers, settle, open }
}

test('outside click immediately after showing closes the popup', async () => {
  const { manager, win, open } = setup()
  await open()
  win.blur()
  assert.equal(win.visible, false)
  assert.equal(manager.show, false)
  assert.equal(manager.clicking, false)
})

test('focus loss emitted while showing the popup is not missed', async () => {
  const { manager, win, open } = setup()
  const show = win.show.bind(win)
  win.show = () => {
    show()
    win.blur()
  }
  await open()
  assert.equal(win.visible, false)
  assert.equal(manager.show, false)
})

test('Windows focus loss during opening cannot leave an unfocused popup visible', async () => {
  const { manager, win, settle, open } = setup(true)
  await open()
  win.blur()
  settle()
  assert.equal(win.visible, false)
  assert.equal(manager.show, false)
})

test('outside click after Windows opening settles closes the popup', async () => {
  const { manager, win, settle, open } = setup(true)
  await open()
  settle()
  assert.equal(win.visible, true)
  win.blur()
  assert.equal(win.visible, false)
  manager.handleTrayClick({})
  assert.equal(manager.show, false, 'the same tray click must not reopen a blurred popup')
})

test('Windows transient focus loss can settle without prematurely hiding the popup', async () => {
  const { win, settle, open } = setup(true)
  await open()
  win.blur()
  assert.equal(win.visible, true)
  win.focused = true
  settle()
  assert.equal(win.visible, true)
  win.blur()
  assert.equal(win.visible, false)
})

test('double-click closes the popup before requesting the main window', async () => {
  const { manager, win, tray, open } = setup()
  await open()
  manager.addModernStyleListener()
  let mainWindowRequested = false
  manager.on('double-click', () => {
    mainWindowRequested = true
    assert.equal(win.visible, false)
    assert.equal(manager.show, false)
  })
  tray.emit('double-click')
  assert.equal(mainWindowRequested, true)
})

test('showing the main window cancels an opening popup before layout acknowledgement', async () => {
  const { manager, win } = setup()
  const Application = loadClass('src/main/Application.ts', (id) =>
    id === 'events' ? { EventEmitter } : {}
  )
  const application = Object.create(Application.prototype)
  application.trayManager = manager
  const shown: string[] = []
  application.windowManager = { showWindow: (page: string) => shown.push(page) }
  const pending = manager.openPopup(400, 24, 'down', 15)
  application.show('index')
  manager.notifyLayoutApplied(win.nonce)
  await pending
  assert.deepEqual(shown, ['index'])
  assert.equal(win.visible, false)
  assert.equal(manager.show, false)
})

test('closing a popup clears its opening timer and blur listener', async () => {
  const { manager, win, timers, open } = setup(true)
  await open()
  manager.closePopup()
  assert.equal(timers.size, 0)
  assert.equal(win.listenerCount('blur'), 0)
  assert.equal(manager.clicking, false)
})

test('replacing or destroying the tray window cancels the old popup lifecycle', async () => {
  const { manager, win, timers, open } = setup(true)
  await open()
  const replacement = new PopupWindow()
  manager.attachWindow(replacement)
  assert.equal(win.visible, false)
  assert.equal(timers.size, 0)
  assert.equal(manager.show, false)
  const pending = manager.openPopup(400, 24, 'down', 15)
  manager.notifyLayoutApplied(replacement.nonce)
  await pending
  manager.destroy()
  assert.equal(replacement.visible, false)
  assert.equal(timers.size, 0)
  assert.equal(replacement.listenerCount('blur'), 0)
})

test('an older layout request cannot show the popup after a close and reopen', async () => {
  const { manager, win, settle } = setup()
  const positions: number[] = []
  win.setBounds = (bounds?: { x: number }) => {
    positions.push(bounds!.x)
  }
  const first = manager.openPopup(100, 24, 'down', 15)
  manager.closePopup()
  const second = manager.openPopup(400, 24, 'down', 15)
  manager.notifyLayoutApplied(win.nonce)
  settle()
  await Promise.all([first, second])
  assert.deepEqual(positions, [400])
  assert.equal(win.visible, true)
  assert.equal(win.listenerCount('blur'), 1)
})
