export function debounce<T extends (...args: any[]) => void>(fn: T, wait: number) {
  let timer: NodeJS.Timeout | undefined
  return function (this: ThisParameterType<T>, ...args: Parameters<T>) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), wait)
  }
}
