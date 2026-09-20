import { ForkPromise } from '@shared/ForkPromise'

class ExamplePluginFork {
  init() {}

  exec(fn: string, ...args: any[]) {
    return new ForkPromise<any>((resolve, reject) => {
      const handler = (this as any)[fn]
      if (typeof handler !== 'function') {
        reject(new Error(`Unknown example plugin command: ${fn}`))
        return
      }
      Promise.resolve(handler.apply(this, args)).then(resolve).catch(reject)
    })
  }

  ping(value = 'pong') {
    return value
  }
}

export default new ExamplePluginFork()
