import assert from 'node:assert/strict'
import { app, BrowserWindow, screen } from 'electron'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { EventEmitter } from 'node:events'
import WindowPresentation from '../../src/main/ui/WindowPresentation'

const profile = mkdtempSync(join(tmpdir(), 'flyenv-window-smoke-'))
app.setPath('userData', profile)
app.commandLine.appendSwitch('disable-gpu')
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const deadline = setTimeout(() => {
  console.error('FAIL native smoke timeout')
  app.exit(1)
}, 30000)
const owner = new WindowPresentation()
let checks = 0
const check = (name: string, run: () => void) => {
  run()
  checks++
  console.log(`PASS ${name}`)
}

app
  .whenReady()
  .then(async () => {
    const displays = screen.getAllDisplays()
    console.log(
      JSON.stringify({
        electron: process.versions.electron,
        displays: displays.map(({ id, bounds, workArea, scaleFactor }) => ({
          id,
          bounds,
          workArea,
          scaleFactor
        }))
      })
    )
    const target = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const width = Math.min(800, target.workArea.width)
    const height = Math.min(600, target.workArea.height)
    const win = new BrowserWindow({
      show: false,
      width,
      height,
      x: target.workArea.x + 20,
      y: target.workArea.y + 20,
      webPreferences: { contextIsolation: true, nodeIntegration: false }
    })
    try {
      await win.loadURL(
        'data:text/html,<title>FlyEnv window validation</title><body style="font:20px system-ui;padding:40px">FlyEnv window presentation validation</body>'
      )
      const initial = win.getBounds()
      await owner.show(win, true)
      check('native window shows on the cursor display', () => {
        assert.equal(win.isVisible(), true)
        assert.equal(screen.getDisplayMatching(win.getBounds()).id, target.id)
      })
      check('same-display normal bounds stay unchanged', () =>
        assert.deepEqual(win.getBounds(), initial)
      )
      await wait(220)
      await owner.show(win, true)
      await wait(150)
      check('repeat show retains temporary all-Spaces visibility', () =>
        assert.equal(win.isVisibleOnAllWorkspaces(), true)
      )
      await wait(200)
      check('temporary all-Spaces visibility is restored', () =>
        assert.equal(win.isVisibleOnAllWorkspaces(), false)
      )
      const pending = owner.show(win, true)
      owner.cancel(win)
      win.hide()
      await pending
      await wait(350)
      check('cancelled native presentation remains hidden', () =>
        assert.equal(win.isVisible(), false)
      )
      await owner.show(win, true)
      win.minimize()
      await wait(250)
      await owner.show(win, true)
      await wait(250)
      check('native minimized window is restored', () => {
        assert.equal(win.isMinimized(), false)
        assert.equal(win.isVisible(), true)
      })
      win.maximize()
      await wait(250)
      await owner.show(win, true)
      check('native maximized window stays maximized', () => assert.equal(win.isMaximized(), true))
      win.unmaximize()
      await wait(250)
      const nativeEvents: EventEmitter = win
      const nativeEvent = (event: 'enter-full-screen' | 'leave-full-screen', action: () => void) =>
        new Promise<void>((resolve, reject) => {
          const done = () => {
            clearTimeout(timer)
            resolve()
          }
          const timer = setTimeout(() => {
            nativeEvents.removeListener(event, done)
            reject(new Error(`Native ${event} timeout`))
          }, 8000)
          nativeEvents.once(event, done)
          action()
        })
      for (const event of ['hide', 'show', 'enter-full-screen', 'leave-full-screen']) {
        nativeEvents.on(event, () =>
          console.log('NATIVE', event, {
            full: win.isFullScreen(),
            pending: owner.isPending(win),
            visible: win.isVisible()
          })
        )
      }
      const diagnosticEntryListeners = win.listenerCount('enter-full-screen')
      const diagnosticExitListeners = win.listenerCount('leave-full-screen')
      await nativeEvent('enter-full-screen', () => win.setFullScreen(true))
      const actualDisplayMatching = screen.getDisplayMatching.bind(screen)
      // One physical screen cannot exercise cross-display geometry. Override only source identity
      // to exercise real AppKit exit/re-entry; every window and transition remains native.
      screen.getDisplayMatching = (bounds) => {
        const actual = actualDisplayMatching(bounds)
        return win.isFullScreen() ? { ...actual, id: -100 } : actual
      }
      try {
        await owner.show(win, true)
        check('native fullscreen migration waits through exit and re-entry', () => {
          assert.equal(win.isFullScreen(), true)
          assert.equal(owner.isPending(win), false)
          assert.equal(win.listenerCount('leave-full-screen'), diagnosticExitListeners)
          assert.equal(win.listenerCount('enter-full-screen'), diagnosticEntryListeners)
        })
        let cancelled!: Promise<void>
        const left = nativeEvent('leave-full-screen', () => {
          cancelled = owner.show(win, true)
        })
        await wait(100)
        owner.cancel(win)
        win.hide()
        await cancelled
        await left
        await wait(250)
        check('native fullscreen cancellation stays hidden after animation', () => {
          assert.equal(win.isVisible(), false)
          assert.equal(win.listenerCount('leave-full-screen'), diagnosticExitListeners)
        })
      } finally {
        screen.getDisplayMatching = actualDisplayMatching
      }
      await owner.show(win, true)
      win.setVisibleOnAllWorkspaces(true, { skipTransformProcessType: true })
      // Let the owner's prior temporary override finish before assigning a permanent policy.
      owner.cancel(win)
      win.setVisibleOnAllWorkspaces(true, { skipTransformProcessType: true })
      await owner.show(win, true)
      await wait(350)
      check('native permanent all-Spaces policy is preserved', () =>
        assert.equal(win.isVisibleOnAllWorkspaces(), true)
      )
      const delayed = owner.show(win, true)
      win.destroy()
      await delayed
      check('destroy during pending show is safe', () => assert.equal(win.isDestroyed(), true))
      console.log(
        `Native smoke: ${checks} passed; ${displays.length} physical display(s). Dual-display visual acceptance requires two displays.`
      )
    } finally {
      clearTimeout(deadline)
      if (!win.isDestroyed()) win.destroy()
      rmSync(profile, { recursive: true, force: true })
    }
    app.exit(0)
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
