export const PRIMARY_FORK_IDLE_TIMEOUT_MS = 180_000
export const TRANSIENT_FORK_IDLE_TIMEOUT_MS = 10_000

export type ForkIdleScheduler = {
  set: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  clear: (timer: ReturnType<typeof setTimeout>) => void
}

const defaultScheduler: ForkIdleScheduler = {
  set: (callback, delayMs) => setTimeout(callback, delayMs),
  clear: (timer) => clearTimeout(timer)
}

export class ForkIdleLifecycle {
  private activeTasks = 0
  private pinned = false
  private disposed = false
  private timer?: ReturnType<typeof setTimeout>

  constructor(
    private readonly idleTimeoutMs: number,
    private readonly onIdle: () => void,
    private readonly scheduler: ForkIdleScheduler = defaultScheduler
  ) {}

  get activeTaskCount() {
    return this.activeTasks
  }

  get isPinned() {
    return this.pinned
  }

  taskStarted() {
    if (this.disposed) return
    this.clearIdleTimer()
    this.activeTasks += 1
  }

  taskSettled() {
    if (this.disposed) return
    if (this.activeTasks > 0) this.activeTasks -= 1
    this.scheduleIfIdle()
  }

  pin() {
    if (this.disposed) return
    this.pinned = true
    this.clearIdleTimer()
  }

  unpin() {
    if (this.disposed) return
    this.pinned = false
    this.scheduleIfIdle()
  }

  childExited() {
    this.clearIdleTimer()
    this.activeTasks = 0
    this.pinned = false
  }

  dispose() {
    this.disposed = true
    this.clearIdleTimer()
    this.activeTasks = 0
    this.pinned = false
  }

  private clearIdleTimer() {
    if (!this.timer) return
    this.scheduler.clear(this.timer)
    this.timer = undefined
  }

  private scheduleIfIdle() {
    if (this.disposed || this.pinned || this.activeTasks > 0 || this.timer) return
    this.timer = this.scheduler.set(() => {
      this.timer = undefined
      if (!this.disposed && !this.pinned && this.activeTasks === 0) this.onIdle()
    }, this.idleTimeoutMs)
  }
}
