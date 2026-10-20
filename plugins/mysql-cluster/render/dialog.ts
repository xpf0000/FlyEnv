export function waitForDialog<T>(
  mount: () => {
    view: { show: boolean; onSubmit(fn: (value: T) => void): void; onClosed(fn: () => void): void }
    dispose(): void
  }
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    try {
      const { view, dispose } = mount()
      let value: T | undefined,
        closed = false
      view.onSubmit((result) => {
        value = result
        view.show = false
      })
      view.onClosed(() => {
        if (closed) return
        closed = true
        try {
          dispose()
          resolve(value)
        } catch (error) {
          reject(error)
        }
      })
    } catch (error) {
      reject(error)
    }
  })
}
