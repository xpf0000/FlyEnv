export class LazyRuntime<T> {
  private promise?: Promise<T>
  private value?: T

  constructor(private readonly factory: () => Promise<T>) {}

  load(): Promise<T> {
    if (!this.promise) {
      this.promise = this.factory().then(
        (value) => {
          this.value = value
          return value
        },
        (error) => {
          this.promise = undefined
          throw error
        }
      )
    }
    return this.promise
  }

  peek(): T | undefined {
    return this.value
  }
}
