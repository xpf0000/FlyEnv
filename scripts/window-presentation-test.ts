import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { build } from 'esbuild'
import { runInNewContext } from 'node:vm'

const bundle = await build({
  entryPoints: ['src/main/ui/WindowManager.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  plugins: [
    {
      name: 'native-boundaries',
      setup(builder) {
        builder.onResolve({ filter: /./ }, (args) => {
          if (args.kind === 'entry-point' || args.path === './WindowPresentation') return
          return { path: args.path, external: true }
        })
      }
    }
  ]
})

type Bounds = { x: number; y: number; width: number; height: number }
const displayA = () => ({
  id: 1,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 24, width: 1920, height: 1032 },
  scaleFactor: 1
})
const displayB = () => ({
  id: 2,
  bounds: { x: 1920, y: 0, width: 1280, height: 800 },
  workArea: { x: 1920, y: 24, width: 1280, height: 752 },
  scaleFactor: 2
})
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

function fixture(mac = true) {
  let now = 0
  let timerId = 0
  const timers = new Map<number, { at: number; run: () => void }>()
  const errors: unknown[][] = []
  const env = {
    mac,
    displays: [displayA(), displayB()],
    cursor: { x: 2200, y: 100 },
    dockVisible: true,
    dockCalls: 0,
    dockResult: () => Promise.resolve()
  }
  const app = Object.assign(new EventEmitter(), {
    isHidden: () => false,
    dock: {
      isVisible: () => env.dockVisible,
      show: () => {
        env.dockCalls++
        return env.dockResult()
      },
      hide: () => {
        env.dockVisible = false
      }
    }
  })
  const nearest = (point: { x: number; y: number }) =>
    [...env.displays].sort((a, b) => {
      const distance = (d: ReturnType<typeof displayA>) => {
        const r = d.bounds
        return (
          Math.max(r.x - point.x, 0, point.x - r.x - r.width) ** 2 +
          Math.max(r.y - point.y, 0, point.y - r.y - r.height) ** 2
        )
      }
      return distance(a) - distance(b)
    })[0]
  const screen = {
    getCursorScreenPoint: () => ({ ...env.cursor }),
    getDisplayNearestPoint: nearest,
    getAllDisplays: () => env.displays,
    getPrimaryDisplay: () => env.displays[0],
    getDisplayMatching: (rect: Bounds) =>
      [...env.displays].sort((a, b) => {
        const overlap = (d: ReturnType<typeof displayA>) =>
          Math.max(
            0,
            Math.min(rect.x + rect.width, d.bounds.x + d.bounds.width) -
              Math.max(rect.x, d.bounds.x)
          ) *
          Math.max(
            0,
            Math.min(rect.y + rect.height, d.bounds.y + d.bounds.height) -
              Math.max(rect.y, d.bounds.y)
          )
        return overlap(b) - overlap(a)
      })[0]
  }
  const module = { exports: {} as any }
  runInNewContext(bundle.outputFiles[0].text, {
    module,
    exports: module.exports,
    console: { log() {} },
    setTimeout(run: () => void, delay: number) {
      const id = ++timerId
      timers.set(id, { at: now + delay, run })
      return id
    },
    clearTimeout(id: number) {
      timers.delete(id)
    },
    require(name: string) {
      if (name === 'events') return { EventEmitter }
      if (name === 'electron') return { app, screen, BrowserWindow: class {} }
      if (name === '@shared/utils') return { isMacOS: () => env.mac }
      if (name.endsWith('/Logger')) return { error: (...args: unknown[]) => errors.push(args) }
      if (name.endsWith('/page')) return { default: { index: {}, tray: {} } }
      if (name.endsWith('/PageOptions')) return { createScaledPageOptions: () => ({}) }
      return {}
    }
  })
  const manager = new module.exports.default({ configManager: { getConfig: () => ({}) } })
  class Window extends EventEmitter {
    bounds: Bounds = { x: 100, y: 100, width: 1000, height: 700 }
    minimum = [800, 600]
    visible = false
    destroyed = false
    allSpaces = false
    minimized = false
    maximized = false
    fullScreen = false
    holdFullScreenExit = false
    holdFullScreenEntry = false
    enteringPending = false
    exitAfterEntry = false
    boundsWrites = 0
    shows = 0
    fullScreenRequests: boolean[] = []
    isDestroyed() {
      return this.destroyed
    }
    isVisible() {
      return this.visible
    }
    isVisibleOnAllWorkspaces() {
      return this.allSpaces
    }
    setVisibleOnAllWorkspaces(value: boolean) {
      this.allSpaces = value
    }
    show() {
      this.shows++
      this.visible = true
    }
    focus() {
      this.visible = true
    }
    hide() {
      const changed = this.visible
      this.visible = false
      if (changed) this.emit('hide')
    }
    close() {
      this.emit('close', { preventDefault() {} })
      this.hide()
    }
    destroy() {
      this.destroyed = true
      this.emit('closed')
    }
    getBounds() {
      return { ...this.bounds }
    }
    getNormalBounds() {
      return { ...this.bounds }
    }
    setBounds(bounds: Bounds) {
      assert.equal(this.fullScreen, false, 'must leave fullscreen before moving')
      this.bounds = { ...bounds }
      this.boundsWrites++
    }
    getMinimumSize() {
      return [...this.minimum]
    }
    setMinimumSize(width: number, height: number) {
      this.minimum = [width, height]
    }
    isMinimized() {
      return this.minimized
    }
    restore() {
      this.minimized = false
    }
    isMaximized() {
      return this.maximized
    }
    maximize() {
      this.maximized = true
    }
    unmaximize() {
      this.maximized = false
    }
    isFullScreen() {
      return this.fullScreen
    }
    setFullScreen(value: boolean) {
      this.fullScreenRequests.push(value)
      if (!value && this.enteringPending) {
        this.exitAfterEntry = true
        return
      }
      if (!value && this.holdFullScreenExit) return
      if (value && this.holdFullScreenEntry) {
        this.enteringPending = true
        return
      }
      this.fullScreen = value
      this.emit(value ? 'enter-full-screen' : 'leave-full-screen')
    }
    finishFullScreenEntry() {
      this.enteringPending = false
      this.fullScreen = true
      this.emit('enter-full-screen')
      if (this.exitAfterEntry) {
        this.exitAfterEntry = false
        this.setFullScreen(false)
      }
    }
    finishFullScreenExit() {
      this.fullScreen = false
      this.emit('leave-full-screen')
    }
  }
  const win = new Window()
  manager.addWindow('index', win)
  return {
    env,
    app,
    manager,
    win,
    errors,
    timers,
    async tick(ms: number) {
      now += ms
      for (const [id, timer] of [...timers])
        if (timer.at <= now) {
          timers.delete(id)
          timer.run()
        }
      await flush()
    },
    holdDock() {
      env.dockVisible = false
      let resolve!: () => void
      const pending = new Promise<void>((done) => {
        resolve = done
      })
      env.dockResult = () => pending
      return () => {
        env.dockVisible = true
        resolve()
      }
    }
  }
}

let passed = 0
const failures: string[] = []
async function test(name: string, run: () => Promise<void>) {
  try {
    await run()
    passed++
    console.log(`PASS ${name}`)
  } catch (error) {
    failures.push(name)
    console.error(`FAIL ${name}: ${error}`)
  }
}

await test('latest show receives a full Space restoration delay', async () => {
  const f = fixture()
  await f.manager.showWindow('index')
  await f.tick(250)
  await f.manager.showWindow('index')
  await f.tick(50)
  assert.equal(f.win.allSpaces, true)
  await f.tick(250)
  assert.equal(f.win.allSpaces, false)
})
await test('permanently all-Spaces windows retain their policy', async () => {
  const f = fixture()
  f.win.allSpaces = true
  await f.manager.showWindow('index')
  await f.tick(1000)
  assert.equal(f.win.allSpaces, true)
})
for (const action of ['hide', 'hide-all', 'close', 'quit', 'destroy', 'native-hide']) {
  await test(`${action} invalidates a pending Dock presentation`, async () => {
    const f = fixture()
    const finish = f.holdDock()
    f.win.visible = true
    const show = f.manager.showWindow('index')
    if (action === 'hide') f.manager.hideWindow('index')
    if (action === 'hide-all') f.manager.hideAllWindow()
    if (action === 'close') f.win.close()
    if (action === 'quit') {
      f.manager.setWillQuit(true)
      f.win.hide()
    }
    if (action === 'destroy') f.win.destroy()
    if (action === 'native-hide') f.win.hide()
    finish()
    await show
    assert.equal(f.win.shows, 0)
    assert.equal(f.win.boundsWrites, 0)
  })
}
await test('quit rejects new presentation requests', async () => {
  const f = fixture()
  f.manager.setWillQuit(true)
  await f.manager.showWindow('index')
  assert.equal(f.win.shows, 0)
})
await test('hiding restores temporary Spaces immediately', async () => {
  const f = fixture()
  await f.manager.showWindow('index')
  f.manager.hideWindow('index')
  assert.equal(f.win.allSpaces, false)
  assert.equal(f.timers.size, 0)
})
await test('existing open uses the cancellable presentation path', async () => {
  const f = fixture()
  const finish = f.holdDock()
  f.manager.openWindow('index')
  f.manager.hideWindow('index')
  finish()
  await flush()
  assert.equal(f.win.visible, false)
})
await test('toggle cancels a show still waiting on Dock', async () => {
  const f = fixture()
  const finish = f.holdDock()
  f.manager.toggleWindow('index')
  f.manager.toggleWindow('index')
  finish()
  await flush()
  assert.equal(f.win.visible, false)
})
await test('already-visible Dock is not transformed again', async () => {
  const f = fixture()
  await f.manager.showWindow('index')
  assert.equal(f.env.dockCalls, 0)
})
await test('Dock failure is supplementary and observed', async () => {
  const f = fixture()
  f.env.dockVisible = false
  f.env.dockResult = () => Promise.reject(new Error('Dock fixture failure'))
  await f.manager.showWindow('index')
  assert.equal(f.win.visible, true)
  assert.equal(f.errors.length, 1)
})
await test('A-to-B migration centers normal bounds in DIP', async () => {
  const f = fixture()
  await f.manager.showWindow('index')
  assert.deepEqual(plain(f.win.bounds), { x: 2060, y: 50, width: 1000, height: 700 })
})
await test('same-display show keeps an in-bounds position', async () => {
  const f = fixture()
  f.env.cursor = { x: 500, y: 500 }
  await f.manager.showWindow('index')
  assert.deepEqual(plain(f.win.bounds), { x: 100, y: 100, width: 1000, height: 700 })
  assert.equal(f.win.boundsWrites, 0)
})
await test('target is captured before Dock wait, not after cursor moves', async () => {
  const f = fixture()
  const finish = f.holdDock()
  const show = f.manager.showWindow('index')
  f.env.cursor = { x: 500, y: 500 }
  finish()
  await show
  assert.equal(f.win.bounds.x, 2060)
})
await test('latest invocation supersedes an older display target', async () => {
  const f = fixture()
  const finish = f.holdDock()
  const first = f.manager.showWindow('index')
  f.env.cursor = { x: 500, y: 500 }
  const second = f.manager.showWindow('index')
  finish()
  await Promise.all([first, second])
  assert.equal(f.win.bounds.x, 100)
  assert.equal(f.win.shows, 1)
})
await test('removed target falls back to a surviving display', async () => {
  const f = fixture()
  const finish = f.holdDock()
  const show = f.manager.showWindow('index')
  f.env.displays = [displayA()]
  finish()
  await show
  assert.equal(f.win.bounds.x, 100)
  assert.equal(f.win.visible, true)
})
await test('target workArea is refreshed after asynchronous work', async () => {
  const f = fixture()
  const finish = f.holdDock()
  const show = f.manager.showWindow('index')
  f.env.displays[1].workArea = { x: 1920, y: 80, width: 1200, height: 720 }
  finish()
  await show
  assert.deepEqual(plain(f.win.bounds), { x: 2020, y: 90, width: 1000, height: 700 })
})
await test('negative-origin vertically arranged displays are supported', async () => {
  const f = fixture()
  f.env.displays[1] = {
    ...displayB(),
    bounds: { x: -1280, y: -800, width: 1280, height: 800 },
    workArea: { x: -1280, y: -776, width: 1280, height: 752 }
  }
  f.env.cursor = { x: -1000, y: -500 }
  await f.manager.showWindow('index')
  assert.deepEqual(plain(f.win.bounds), { x: -1140, y: -750, width: 1000, height: 700 })
})
await test('small displays fit bounds and minimum size; larger displays restore minimum', async () => {
  const f = fixture()
  f.env.displays[1].workArea = { x: 1920, y: 24, width: 600, height: 400 }
  await f.manager.showWindow('index')
  assert.deepEqual(plain(f.win.bounds), { x: 1920, y: 24, width: 600, height: 400 })
  assert.deepEqual(f.win.minimum, [600, 400])
  f.env.cursor = { x: 100, y: 100 }
  await f.manager.showWindow('index')
  assert.deepEqual(f.win.minimum, [800, 600])
})
await test('same-display offscreen bounds are clamped to the workArea', async () => {
  const f = fixture()
  f.env.cursor = { x: 100, y: 100 }
  f.win.bounds = { x: -100, y: 0, width: 1000, height: 700 }
  await f.manager.showWindow('index')
  assert.deepEqual(plain(f.win.bounds), { x: 0, y: 24, width: 1000, height: 700 })
})
for (const mode of ['minimized', 'maximized'] as const) {
  await test(`${mode} windows migrate without losing the intended visible mode`, async () => {
    const f = fixture()
    f.win[mode] = true
    await f.manager.showWindow('index')
    assert.equal(f.win.bounds.x, 2060)
    assert.equal(f.win.minimized, false)
    assert.equal(f.win.maximized, mode === 'maximized')
  })
}
await test('fullscreen migration waits for native exit and re-enters on target', async () => {
  const f = fixture()
  f.win.fullScreen = true
  f.win.holdFullScreenExit = true
  const show = f.manager.showWindow('index')
  await flush()
  assert.equal(f.win.boundsWrites, 0)
  f.win.finishFullScreenExit()
  await show
  assert.equal(f.win.bounds.x, 2060)
  assert.equal(f.win.fullScreen, true)
  assert.deepEqual(f.win.fullScreenRequests, [false, true])
  assert.equal(f.win.listenerCount('leave-full-screen'), 0)
})
await test('a later fullscreen migration still waits for a fresh native exit', async () => {
  const f = fixture()
  f.win.fullScreen = true
  await f.manager.showWindow('index')
  f.env.cursor = { x: 100, y: 100 }
  f.win.holdFullScreenExit = true
  const show = f.manager.showWindow('index')
  await flush()
  assert.equal(f.win.fullScreenRequests.filter((value) => !value).length, 2)
  f.win.finishFullScreenExit()
  await show
  assert.equal(f.win.bounds.x, 460)
  assert.equal(f.win.fullScreen, true)
})
await test('hiding during fullscreen exit cancels listeners and prevents reopening', async () => {
  const f = fixture()
  f.win.fullScreen = true
  f.win.holdFullScreenExit = true
  const show = f.manager.showWindow('index')
  await flush()
  f.manager.hideWindow('index')
  await flush()
  f.win.finishFullScreenExit()
  await show
  assert.equal(f.win.shows, 0)
  assert.equal(f.win.boundsWrites, 0)
  assert.equal(f.win.listenerCount('leave-full-screen'), 0)
  assert.equal(f.timers.size, 0)
})
await test('fullscreen exit timeout reports failure without moving or showing', async () => {
  const f = fixture()
  f.win.fullScreen = true
  f.win.holdFullScreenExit = true
  const show = f.manager.showWindow('index')
  await flush()
  await f.tick(5000)
  await show
  assert.equal(f.win.shows, 0)
  assert.equal(f.win.boundsWrites, 0)
  assert.equal(f.win.listenerCount('leave-full-screen'), 0)
  assert.equal(f.errors.length, 1)
})
await test('AppKit hide notifications during visible fullscreen transitions do not cancel intent', async () => {
  const f = fixture()
  f.win.visible = true
  f.win.fullScreen = true
  f.win.holdFullScreenExit = true
  const show = f.manager.showWindow('index')
  await flush()
  f.win.emit('hide')
  f.win.finishFullScreenExit()
  await show
  assert.equal(f.win.fullScreen, true)
  assert.equal(f.win.shows, 1)
})
await test('new invocation during native fullscreen entry waits before migrating again', async () => {
  const f = fixture()
  f.win.fullScreen = true
  f.win.holdFullScreenEntry = true
  const first = f.manager.showWindow('index')
  await flush()
  assert.equal(f.win.fullScreenRequests.includes(true), true)
  const writesBefore = f.win.boundsWrites
  f.env.cursor = { x: 100, y: 100 }
  const second = f.manager.showWindow('index')
  await flush()
  assert.equal(f.win.boundsWrites, writesBefore, 'no migration during native entry')
  f.win.holdFullScreenEntry = false
  f.win.finishFullScreenEntry()
  await Promise.all([first, second])
  assert.equal(f.win.bounds.x, 460)
  assert.equal(f.win.fullScreen, true)
})
await test('hide then show during native exit joins the still-running transition', async () => {
  const f = fixture()
  f.win.fullScreen = true
  f.win.holdFullScreenExit = true
  const first = f.manager.showWindow('index')
  await flush()
  f.manager.hideWindow('index')
  // macOS can change its fullscreen style mask before emitting leave-full-screen.
  f.win.fullScreen = false
  const second = f.manager.showWindow('index')
  await flush()
  assert.equal(f.win.boundsWrites, 0, 'native exit must settle before setBounds')
  f.win.finishFullScreenExit()
  await Promise.all([first, second])
  assert.equal(f.win.bounds.x, 2060)
})
await test('cancel during native entry prevents a late fullscreen event reopening the window', async () => {
  const f = fixture()
  f.win.fullScreen = true
  f.win.holdFullScreenEntry = true
  const show = f.manager.showWindow('index')
  await flush()
  f.manager.hideWindow('index')
  f.win.visible = true
  f.win.finishFullScreenEntry()
  f.win.finishFullScreenExit()
  await show
  assert.equal(f.win.visible, false)
  assert.equal(f.timers.size, 0)
})
await test('destroyWindow disposes transitions before removing native listeners', async () => {
  const f = fixture()
  f.win.fullScreen = true
  f.win.holdFullScreenExit = true
  const show = f.manager.showWindow('index')
  await flush()
  f.manager.destroyWindow('index')
  await flush()
  assert.equal(f.timers.size, 0)
  await show
  assert.equal(f.errors.length, 0)
})
await test('tray windows retain icon positioning and do not migrate', async () => {
  const f = fixture()
  f.manager.addWindow('tray', f.win)
  f.win.allSpaces = true
  await f.manager.showWindow('tray')
  assert.equal(f.win.boundsWrites, 0)
  assert.equal(f.win.allSpaces, true)
})
await test('non-mac show retains synchronous visibility and geometry', async () => {
  const f = fixture(false)
  const show = f.manager.showWindow('index')
  assert.equal(f.win.visible, true)
  assert.equal(f.win.boundsWrites, 0)
  assert.equal(f.win.allSpaces, false)
  assert.equal(f.env.dockCalls, 0)
  await show
})
console.log(`${passed} passed, ${failures.length} failed`)
if (failures.length) process.exitCode = 1
