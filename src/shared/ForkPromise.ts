type ResolveType<T> = (value: undefined | T | PromiseLike<T>) => void
type RejectType = (reason?: any) => void
type OnType = (data?: any) => void

/**
 * 扩展Promise
 * resolve， reject， on
 * 可以发送中间过程信息了
 */
export class ForkPromise<T> {
  _cbOn: OnType | undefined
  private res: ResolveType<T> | undefined
  private rej: RejectType | undefined
  private readonly promise: Promise<T>
  private onData: Array<Array<any>> = []

  constructor(executor: (resolve: ResolveType<T>, reject: RejectType, on: OnType) => void) {
    this.promise = new Promise<T>((resolve, reject) => {
      this.res = resolve
      this.rej = reject
      executor(resolve, reject, (...args: any) => {
        if (!this?._cbOn) {
          this.onData.push(args)
        } else {
          this?._cbOn?.(...args)
        }
      })
    })
  }

  then<TResult1 = T, TResult2 = never>(
    onFulfilled: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ) {
    return this.promise.then(onFulfilled, onrejected)
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null
  ): Promise<T | TResult> {
    return this.promise.catch(onrejected)
  }

  resolve(value?: T | PromiseLike<T>): void {
    return this?.res?.(value)
  }

  reject(reason?: any): void {
    return this?.rej?.(reason)
  }

  on(cb: OnType) {
    this._cbOn = cb
    this.onData.forEach((d) => {
      cb(...d)
    })
    this.onData.splice(0)
    return this
  }
}
