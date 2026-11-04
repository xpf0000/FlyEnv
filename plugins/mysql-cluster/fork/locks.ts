export class OperationLocks {
  runMany<T>(keys: string[], action: string, task: () => Promise<T>): Promise<T> {
    const ordered = [...new Set(keys)].sort()
    const take = (index: number): Promise<T> =>
      index === ordered.length ? task() : this.run(ordered[index], action, () => take(index + 1))
    return take(0)
  }
  private flights = new Map<string, { action: string; promise: Promise<any> }>()
  run<T>(key: string, action: string, task: () => Promise<T>): Promise<T> {
    const current = this.flights.get(key)
    if (current)
      return current.action === action
        ? current.promise
        : Promise.reject(new Error(`Instance is busy: ${current.action}`))
    const promise = Promise.resolve()
      .then(task)
      .finally(() => {
        if (this.flights.get(key)?.promise === promise) this.flights.delete(key)
      })
    this.flights.set(key, { action, promise })
    return promise
  }
}
