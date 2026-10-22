import { watch } from 'vue'

// The shared host backup owner clears backuping at terminal even on hosts whose
// success callback leaves the returned promise pending. Observe before starting.
export async function waitForSharedBackup(
  state: Record<string, boolean>,
  bin: string,
  start: () => Promise<unknown>
): Promise<unknown> {
  let started = false
  let complete!: () => void
  const terminal = new Promise<void>((resolve) => {
    complete = resolve
  })
  const stop = watch(
    () => state[bin],
    (busy) => {
      if (busy) started = true
      else if (started) complete()
    },
    { flush: 'sync' }
  )
  try {
    return await Promise.race([Promise.resolve().then(start), terminal])
  } finally {
    stop()
  }
}
