export class OperationLocks {
  private flights = new Map<string, { action: string; promise: Promise<any> }>()
  run<T>(key: string, action: string, task: () => Promise<T>): Promise<T> {
    const current = this.flights.get(key)
    if (current) return current.action === action ? current.promise : Promise.reject(new Error(`Instance is busy: ${current.action}`))
    const promise = Promise.resolve().then(task).finally(() => {
      if (this.flights.get(key)?.promise === promise) this.flights.delete(key)
    })
    this.flights.set(key, { action, promise })
    return promise
  }
}
