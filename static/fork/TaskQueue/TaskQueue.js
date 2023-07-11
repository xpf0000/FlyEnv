class TaskQueue {
  #queue = []
  #runQueue = []
  #runSize = 4
  #_progress = {
    count: 0,
    finish: 0,
    fail: 0,
    failTask: [],
    success: 0,
    successTask: []
  }
  #progressFn = undefined
  #endFn = undefined

  constructor(size = 4) {
    this.#runSize = size
  }

  #_handle() {
    if (this.#runQueue.length < this.#runSize && this.#queue.length > 0) {
      const task = this.#queue.shift()
      this.#runQueue.push(task)
      const next = () => {
        this.#progressFn && this.#progressFn(this.#_progress)
        this.#runQueue.splice(this.#runQueue.indexOf(task), 1)
        this.#_handle()
      }
      task
        .run()
        .then((res) => {
          this.#_progress.finish += 1
          if (res) {
            this.#_progress.success += 1
            this.#_progress.successTask.push(task)
          }
          next()
        })
        .catch((err) => {
          console.log('task catch: ', err)
          this.#_progress.finish += 1
          this.#_progress.fail += 1
          task.msg = err.toString()
          this.#_progress.failTask.push(task)
          next()
        })
    }
    if (this.#queue.length === 0 && this.#runQueue.length === 0) {
      this.#endFn && this.#endFn()
    }
  }

  initQueue(queue) {
    this.#queue = queue
    return this
  }

  progress(fn) {
    this.#progressFn = fn
    return this
  }

  end(fn) {
    this.#endFn = fn
    return this
  }

  run() {
    this.#_progress.count = this.#queue.length
    this.#_handle()
  }
}

module.exports = TaskQueue
