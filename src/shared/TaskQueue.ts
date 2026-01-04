import type { CallbackFn } from '@shared/app'

export interface TaskItem {
  run: () => Promise<boolean>
  msg?: string
}
export interface TaskQueueProgress {
  count: number
  finish: number
  fail: number
  success: number
  failTask: Array<TaskItem>
  successTask: Array<TaskItem>
}
export class TaskQueue {
  private queue: Array<TaskItem> = []
  private runQueue: Array<TaskItem> = []
  private runSize = 4
  private _progress: TaskQueueProgress = {
    count: 0,
    finish: 0,
    fail: 0,
    failTask: [],
    success: 0,
    successTask: []
  }
  private progressFn: CallbackFn | undefined = undefined
  private endFn: CallbackFn | undefined = undefined

  constructor(size = 4) {
    this.runSize = size
  }

  private _handle() {
    if (this.runQueue.length < this.runSize && this.queue.length > 0) {
      const task = this.queue.shift()!
      this.runQueue.push(task)
      const next = () => {
        this.progressFn?.(this._progress)
        this.runQueue.splice(this.runQueue.indexOf(task), 1)
        this._handle()
      }
      task
        .run()
        .then((res) => {
          this._progress.finish += 1
          if (res) {
            this._progress.success += 1
            this._progress.successTask.push(task)
          }
          next()
        })
        .catch((err) => {
          console.log('task catch: ', err)
          this._progress.finish += 1
          this._progress.fail += 1
          task.msg = err.toString()
          this._progress.failTask.push(task)
          next()
        })
    }
    if (this.queue.length === 0 && this.runQueue.length === 0) {
      this.endFn?.()
    }
  }

  initQueue(queue: Array<TaskItem>) {
    this.queue = queue
    return this
  }

  progress(fn: CallbackFn) {
    this.progressFn = fn
    return this
  }

  end(fn: CallbackFn) {
    this.endFn = fn
    return this
  }

  run() {
    this._progress.count = this.queue.length
    const max = this.runSize - this.runQueue.length
    for (let i = 0; i < max; i++) {
      this._handle()
    }
  }
}
