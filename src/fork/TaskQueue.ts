import { cpus } from 'os'

interface TaskItem {
  item: (...args: any) => Promise<any>
  param: any
  state: 'wait' | 'running'
}
class TaskQueue {
  private callBack: WeakMap<TaskItem, { resolve: Function; reject: Function }> = new WeakMap()
  #queue: Array<TaskItem> = []
  #runQueue: Array<TaskItem> = []
  #runSize = 4

  constructor() {
    this.#runSize = cpus().length
  }

  #_handle() {
    console.log('TaskQueue: ', this.#queue.length, this.#runQueue.length)
    /**
     * queue is empty. exit
     */
    if (this.#queue.length === 0 && this.#runQueue.length === 0) {
      return
    }
    /**
     * run queue is not full. put it full
     */
    if (this.#runQueue.length < this.#runSize) {
      for (let i = 0; i < this.#runSize - this.#runQueue.length; i += 1) {
        const taskItem = this.#queue.shift()
        if (taskItem) {
          this.#runQueue.push(taskItem)
        }
      }
    }

    for (const taskItem of this.#runQueue) {
      if (taskItem.state === 'wait') {
        taskItem.state = 'running'
        const item = taskItem.item
        const { resolve, reject } = this.callBack.get(taskItem)!
        item(...taskItem.param)
          .then((...args) => {
            resolve(...args)
          })
          .catch((e) => {
            reject(e)
          })
          .finally(() => {
            const index = this.#runQueue.indexOf(taskItem)
            if (index >= 0) {
              this.#runQueue.splice(index, 1)
            }
            this.callBack.delete(taskItem)
            this.#_handle()
          })
      }
    }
  }

  run<T>(item: (...args: any) => Promise<T>, ...args: any): Promise<T> {
    return new Promise((resolve, reject) => {
      const obj: TaskItem = {
        item,
        param: args ?? [],
        state: 'wait'
      }
      this.callBack.set(obj, { resolve, reject })
      if (this.#runQueue.length >= this.#runSize) {
        this.#queue.push(obj)
      } else {
        this.#runQueue.push(obj)
      }
      this.#_handle()
    })
  }
}
export default new TaskQueue()
