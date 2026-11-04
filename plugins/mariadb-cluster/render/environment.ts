import { watch } from 'vue'

// The main-process acknowledgement precedes its asynchronous Server broadcast.
export function waitForHomebrewDiscovery(
  cellar: () => string | undefined,
  cancelled: () => boolean,
  request: () => Promise<unknown>,
  timeout = 30_000
): Promise<void> {
  let stop = () => {}
  let timer: ReturnType<typeof setTimeout> | undefined
  const result = new Promise<void>((resolve, reject) => {
    const check = () => {
      if (cancelled()) reject(new Error('Operation cancelled'))
      else if (cellar()?.trim()) resolve()
    }
    stop = watch([cellar, cancelled], check, { flush: 'sync' })
    timer = setTimeout(
      () => reject(new Error('Homebrew was not detected; inspect the installation output')),
      timeout
    )
    if (cancelled() || cellar()?.trim()) check()
    else void Promise.resolve().then(request).then(check, reject)
  })
  return result.finally(() => {
    stop()
    if (timer) clearTimeout(timer)
  })
}
