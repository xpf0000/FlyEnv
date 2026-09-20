class ExamplePluginFork {
  init() {}

  exec(fn: string, ...args: any[]) {
    const handler = (this as any)[fn]
    if (typeof handler !== 'function') {
      return Promise.reject(new Error(`Unknown example plugin command: ${fn}`))
    }
    return Promise.resolve(handler.apply(this, args))
  }

  ping(value = 'pong') {
    return value
  }
}

export default new ExamplePluginFork()
