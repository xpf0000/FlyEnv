import { app, screen } from 'electron'
import type { BrowserWindow, Display, Point, Rectangle } from 'electron'
import { isMacOS } from '@shared/utils'
import logger from '../core/Logger'

interface FullScreenTransition {
  target: boolean
  promise: Promise<boolean>
  dispose: () => void
}

interface PresentationState {
  request: number
  pending: boolean
  ownsAllSpaces: boolean
  restoreTimer?: NodeJS.Timeout
  minimumSize?: [number, number]
  restoreFullScreen: boolean
  hidden: boolean
  fullScreenTransition?: FullScreenTransition
  cancelWait?: () => void
}

/** Main-process owner of pending shows, native transitions and temporary Space visibility. */
export default class WindowPresentation {
  private states = new WeakMap<BrowserWindow, PresentationState>()
  private dockShow?: Promise<void>

  isPending(window: BrowserWindow) {
    return this.states.get(window)?.pending ?? false
  }

  show(window: BrowserWindow, moveToCursor: boolean): Promise<void> {
    const state = this.stateFor(window)
    state.cancelWait?.()
    const request = ++state.request
    state.pending = true
    state.hidden = false
    clearTimeout(state.restoreTimer)
    state.restoreTimer = undefined
    return this.present(window, state, request, moveToCursor)
      .catch((error) => {
        if (state.request === request) this.restoreSpaces(window, state)
        this.reportError('show', error)
      })
      .finally(() => {
        if (state.request === request) state.pending = false
      })
  }

  cancel(window: BrowserWindow) {
    const state = this.states.get(window)
    if (!state) return
    state.request++
    state.pending = false
    state.hidden = true
    state.cancelWait?.()
    state.restoreFullScreen = false
    // Intent cancellation cannot stop an animation already executing in AppKit.
    // Keep tracking it, and queue an exit if fullscreen re-entry was in progress.
    const transition = state.fullScreenTransition
    if (transition?.target && !window.isDestroyed()) {
      transition.target = false
      try {
        window.setFullScreen(false)
      } catch (error) {
        this.reportError('cancel-fullscreen', error)
      }
    }
    this.restoreSpaces(window, state)
  }

  dispose(window: BrowserWindow) {
    this.cancel(window)
    this.states.get(window)?.fullScreenTransition?.dispose()
    this.states.delete(window)
  }

  private stateFor(window: BrowserWindow) {
    let state = this.states.get(window)
    if (!state) {
      state = {
        request: 0,
        pending: false,
        ownsAllSpaces: false,
        restoreFullScreen: false,
        hidden: false
      }
      this.states.set(window, state)
      // Native close/hide paths can bypass WindowManager.hideWindow().
      window.on('hide', () => {
        // AppKit also emits hide while moving a still-visible window through fullscreen.
        if (!window.isVisible() || (isMacOS() && app.isHidden())) this.cancel(window)
      })
      window.on('close', () => this.cancel(window))
      window.once('closed', () => this.dispose(window))
    }
    return state
  }

  private async present(
    window: BrowserWindow,
    state: PresentationState,
    request: number,
    moveToCursor: boolean
  ) {
    if (!isMacOS()) {
      window.show()
      return
    }
    // Capture before Dock activation or a fullscreen animation can move the cursor/focus.
    const point = moveToCursor ? screen.getCursorScreenPoint() : undefined
    const displayId = point ? screen.getDisplayNearestPoint(point).id : undefined
    const current = () => state.request === request && !window.isDestroyed()
    await this.ensureDock()
    if (!current()) return

    // Another request may have cancelled its waiter while the native animation continues.
    if (state.fullScreenTransition) {
      if (!(await this.waitForFullScreen(state, state.fullScreenTransition)) || !current()) return
    }
    let target = point ? this.resolveDisplay(displayId!, point) : undefined
    const differentDisplay =
      target && screen.getDisplayMatching(window.getBounds()).id !== target.id
    if (differentDisplay && window.isFullScreen()) {
      state.restoreFullScreen = true
      const transition = this.transitionFullScreen(window, state, false)
      if (!(await this.waitForFullScreen(state, transition)) || !current()) return
      // Native transitions can overlap a monitor unplug or a work-area change.
      target = point ? this.resolveDisplay(displayId!, point) : undefined
    }
    if (!current()) return

    this.prepareSpaces(window, state)
    if (window.isMinimized()) window.restore()
    if (target && !window.isFullScreen()) this.moveToDisplay(window, state, target)
    window.show()
    if (state.restoreFullScreen) {
      state.restoreFullScreen = false
      const transition = this.transitionFullScreen(window, state, true)
      if (!(await this.waitForFullScreen(state, transition)) || !current()) return
    }
    if (state.ownsAllSpaces) {
      state.restoreTimer = setTimeout(() => this.restoreSpaces(window, state), 300)
    }
  }

  private async ensureDock() {
    if (!app.dock || app.dock.isVisible()) return
    if (!this.dockShow) {
      this.dockShow = (async () => {
        try {
          await app.dock!.show()
        } catch (error) {
          // Dock visibility must not turn a usable window into a failed presentation.
          this.reportError('dock', error)
        }
      })().finally(() => {
        this.dockShow = undefined
      })
    }
    await this.dockShow
  }

  private resolveDisplay(id: number, point: Point) {
    return (
      screen.getAllDisplays().find((display) => display.id === id) ??
      screen.getDisplayNearestPoint(point)
    )
  }

  private moveToDisplay(window: BrowserWindow, state: PresentationState, target: Display) {
    const area = target.workArea
    if (area.width <= 0 || area.height <= 0) throw new Error('Display has no usable work area')
    const maximized = window.isMaximized()
    const bounds = maximized ? window.getNormalBounds() : window.getBounds()
    const source = screen.getDisplayMatching(window.getBounds())
    if (!state.minimumSize) {
      const [width, height] = window.getMinimumSize()
      state.minimumSize = [width, height]
    }
    const minimum: [number, number] = [
      Math.min(state.minimumSize[0], area.width),
      Math.min(state.minimumSize[1], area.height)
    ]
    const currentMinimum = window.getMinimumSize()
    if (minimum[0] !== currentMinimum[0] || minimum[1] !== currentMinimum[1]) {
      window.setMinimumSize(...minimum)
    }
    const width = Math.min(Math.max(bounds.width, minimum[0]), area.width)
    const height = Math.min(Math.max(bounds.height, minimum[1]), area.height)
    const next: Rectangle = {
      x: Math.round(
        source.id !== target.id
          ? area.x + (area.width - width) / 2
          : Math.min(Math.max(bounds.x, area.x), area.x + area.width - width)
      ),
      y: Math.round(
        source.id !== target.id
          ? area.y + (area.height - height) / 2
          : Math.min(Math.max(bounds.y, area.y), area.y + area.height - height)
      ),
      width,
      height
    }
    if (
      next.x === bounds.x &&
      next.y === bounds.y &&
      next.width === bounds.width &&
      next.height === bounds.height
    )
      return
    if (maximized) window.unmaximize()
    window.setBounds(next)
    if (maximized) window.maximize()
  }

  private waitForFullScreen(state: PresentationState, transition: FullScreenTransition) {
    return new Promise<boolean>((resolve, reject) => {
      const cancel = () => {
        cleanup()
        resolve(false)
      }
      const cleanup = () => {
        if (state.cancelWait === cancel) state.cancelWait = undefined
      }
      state.cancelWait = cancel
      transition.promise.then(
        (completed) => {
          cleanup()
          resolve(completed)
        },
        (error) => {
          cleanup()
          reject(error)
        }
      )
    })
  }

  private transitionFullScreen(
    window: BrowserWindow,
    state: PresentationState,
    target: boolean
  ): FullScreenTransition {
    let dispose!: () => void
    let begin!: () => void
    const transition: FullScreenTransition = {
      target,
      promise: new Promise<boolean>((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timer)
          window.removeListener('enter-full-screen', entered)
          window.removeListener('leave-full-screen', left)
          if (state.fullScreenTransition === transition) state.fullScreenTransition = undefined
        }
        const finished = (fullScreen: boolean) => {
          // A cancelled AppKit transition can make its window visible again on settlement.
          if (state.hidden && !window.isDestroyed()) window.hide()
          if (fullScreen !== transition.target) return
          cleanup()
          resolve(true)
        }
        const entered = () => finished(true)
        const left = () => finished(false)
        const timer = setTimeout(() => {
          cleanup()
          state.restoreFullScreen = false
          reject(new Error('Timed out waiting for fullscreen display migration'))
        }, 5000)
        dispose = () => {
          cleanup()
          resolve(false)
        }
        window.on('enter-full-screen', entered)
        window.on('leave-full-screen', left)
        begin = () => {
          try {
            window.setFullScreen(target)
          } catch (error) {
            cleanup()
            state.restoreFullScreen = false
            reject(error)
          }
        }
      }),
      dispose: () => dispose()
    }
    state.fullScreenTransition = transition
    begin()
    return transition
  }

  private prepareSpaces(window: BrowserWindow, state: PresentationState) {
    // A pending temporary override is ours; permanently all-Spaces windows are left alone.
    if (!state.ownsAllSpaces && window.isVisibleOnAllWorkspaces()) return
    if (!state.ownsAllSpaces) {
      window.setVisibleOnAllWorkspaces(true, { skipTransformProcessType: true })
      state.ownsAllSpaces = true
    }
  }

  private restoreSpaces(window: BrowserWindow, state: PresentationState) {
    clearTimeout(state.restoreTimer)
    state.restoreTimer = undefined
    if (state.ownsAllSpaces) {
      state.ownsAllSpaces = false
      if (!window.isDestroyed()) {
        try {
          window.setVisibleOnAllWorkspaces(false, { skipTransformProcessType: true })
        } catch (error) {
          this.reportError('restore-spaces', error)
        }
      }
    }
  }

  private reportError(step: string, error: unknown) {
    try {
      logger.error(`[FlyEnv][WindowPresentation] ${step}:`, error)
    } catch {
      // Diagnostics cannot block window presentation or introduce unhandled rejections.
    }
  }
}
