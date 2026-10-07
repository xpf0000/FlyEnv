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
  let trayDestroyed = false
  let contextMenu: any[] = []
  const checkTray = () => {
    if (trayDestroyed) throw new Error('Tray is destroyed')
  }
  const image = { resize: () => image }
  Object.assign(tray, {
    setToolTip() {},
    isDestroyed: () => trayDestroyed,
    setContextMenu: (menu: any[]) => {
      checkTray()
      contextMenu = menu
    },
    setImage: checkTray,
    destroy() {
      checkTray()
      trayDestroyed = true
    },
    getBounds: () => {
      checkTray()
      return { x: 500, y: 0, width: 24, height: 24 }
    }
  })
  const electron = {
    Menu: { buildFromTemplate: (items: unknown[]) => items },
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
  return { manager, win, tray, timers, settle, open, getMenu: () => contextMenu }
}

const classicStatus = (serviceCount: number, groupCount = 0) => ({
  groupIsRunning: false,
  groupDisabled: false,
  startupGroups: Array.from({ length: groupCount }, (_, id) => ({
    id: `group-${id}`,
    name: `Group ${id}`,
    run: false,
    running: false,
    disabled: false
  })),
  service: Array.from({ length: serviceCount }, (_, id) => ({
    id: `service-${id}`,
    typeFlag: `module-${id}`,
    label: `Service ${id}`,
    run: id === 0,
    running: false,
    disabled: id === 1
  }))
})

test('classic menus keep fifteen actions flat and always keep main window and exit at the top level', () => {
  for (const windows of [false, true]) {
    const { manager, getMenu } = setup(windows)
    manager.setStyle('classic')
    manager.menuChange(classicStatus(14))
    assert.equal(getMenu().filter((item) => item.type !== 'separator').length, 17)
    assert.equal(
      getMenu().some((item) => item.submenu),
      false
    )

    manager.menuChange(classicStatus(15))
    const actions = getMenu().filter((item) => item.type !== 'separator')
    assert.equal(actions.length, 18)
    assert.equal(actions[14].label, 'Service 13')
    assert.equal(actions[15].label, 'tray.more')
    assert.equal(actions[15].submenu.length, 1)
    assert.equal(actions[15].submenu[0].label, 'Service 14')
    assert.equal(actions[16].label, 'tray.showMainWin')
    assert.equal(actions[17].label, 'tray.exit')
    const emitted: string[] = []
    manager.on('action', (action: string) => emitted.push(action))
    actions[16].click()
    actions[17].click()
    assert.deepEqual(emitted, ['show', 'exit'])
  }
})

test('overflow preserves startup group and service actions, status and ordering', () => {
  const { manager, getMenu } = setup()
  manager.setStyle('classic')
  manager.menuChange(classicStatus(3, 15))
  const actions = getMenu().filter((item) => item.type !== 'separator')
  assert.equal(actions[14].label, 'Group 13')
  const more = actions[15].submenu
  assert.deepEqual(
    Array.from(more, (item: any) => item.label ?? 'separator'),
    ['Group 14', 'separator', 'Service 0', 'Service 1', 'Service 2']
  )
  assert.equal(more[2].enabled, true)
  assert.equal(more[3].enabled, false)
  const emitted: unknown[] = []
  manager.on('action', (...args: unknown[]) => emitted.push(args))
  more[0].click()
  more[2].click()
  assert.deepEqual(emitted, [
    ['startupGroupDo', 'group-14'],
    ['switchChange', 'module-0']
  ])
})

test('overflow does not leave a separator before More or at the start of its submenu', () => {
  const { manager, getMenu } = setup()
  manager.setStyle('classic')
  manager.menuChange(classicStatus(1, 14))
  const menu = getMenu()
  assert.equal(menu[menu.length - 5].label, 'Group 13')
  assert.equal(menu[menu.length - 4].submenu[0].label, 'Service 0')
  assert.equal(menu[menu.length - 3].type, 'separator')
  assert.equal(menu[menu.length - 2].label, 'tray.showMainWin')
  assert.equal(menu[menu.length - 1].label, 'tray.exit')
})

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

test('late renderer updates after tray shutdown are ignored for both styles', () => {
  for (const style of ['modern', 'classic']) {
    const { manager } = setup()
    manager.setStyle(style)
    manager.destroy()
    assert.doesNotThrow(() => manager.iconChange(true))
    assert.doesNotThrow(() => manager.menuChange({ groupIsRunning: true }))
    assert.equal(manager.active, false)
    assert.equal(manager.status, undefined)
  }
})

test('renderer updates still apply while the tray is alive', () => {
  for (const style of ['modern', 'classic']) {
    const { manager } = setup()
    manager.setStyle(style)
    const status = { groupIsRunning: true }
    manager.iconChange(true)
    manager.menuChange(status)
    assert.equal(manager.active, true)
    assert.equal(manager.status, status)
    manager.iconChange(false)
    assert.equal(manager.active, false)
  }
})

test('tray shutdown is safe to repeat even when the native tray was already destroyed', () => {
  for (const nativeFirst of [false, true]) {
    const { manager, tray } = setup()
    if (nativeFirst) (tray as any).destroy()
    assert.doesNotThrow(() => manager.destroy())
    assert.doesNotThrow(() => manager.destroy())
  }
})

test('late style and popup requests cannot revive a destroyed tray', async () => {
  const { manager, win, tray } = setup()
  manager.setStyle('modern')
  manager.destroy()
  let styleChanges = 0
  let clicks = 0
  manager.on('style-changed', () => styleChanges++)
  manager.on('click', () => clicks++)
  assert.doesNotThrow(() => manager.setStyle('classic'))
  manager.addModernStyleListener()
  assert.doesNotThrow(() => manager.handleTrayClick({}))
  assert.doesNotThrow(() => manager.pushPopupLayout())
  assert.equal(manager.getPopupLayout(), undefined)
  await manager.openPopup(400, 24, 'down', 15)
  assert.equal(styleChanges, 0)
  assert.equal(clicks, 0)
  assert.equal(tray.listenerCount('right-click'), 0)
  assert.equal(win.visible, false)
})

test('tray shutdown cancels popup layout acknowledgement and timers', async () => {
  const { manager, win, timers, settle } = setup(true)
  const pending = manager.openPopup(400, 24, 'down', 15)
  manager.destroy()
  manager.notifyLayoutApplied(win.nonce)
  settle()
  await pending
  assert.equal(win.visible, false)
  assert.equal(manager.show, false)
  assert.equal(timers.size, 0)
  assert.equal(win.listenerCount('blur'), 0)
})
