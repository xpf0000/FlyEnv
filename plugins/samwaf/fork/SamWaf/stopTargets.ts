import { ProcessOwnedPidsByPidOrDescendant, type PItem } from '@shared/Process'

/**
 * SamWaf starts on Windows via `start "" /B ./SamWaf64.exe`, so the supervisor's
 * command line stays relative and never carries the absolute install markers
 * Base's ownership check requires. Base then kills only the worker (absolute
 * command line) and the surviving supervisor respawns it — stop reports success
 * while the process tree lives on.
 *
 * Recover supervisor roots the same way ClickHouse recovers its watchdog root:
 * a SamWaf-named root whose descendant carries this version's markers owns the
 * whole tree. Foreign installs fail the descendant marker check and stay
 * untouched; a lone samwaf-named root without an owned descendant is not claimed.
 */
export const supervisedSamWafTreePids = (
  list: PItem[],
  ownedMarkers: string[],
  exclude: ReadonlySet<string>,
  rootPredicate?: (process: PItem) => boolean
): string[] => {
  const extra: string[] = []
  for (const item of list) {
    if (exclude.has(item.PID)) continue
    if (rootPredicate && !rootPredicate(item)) continue
    const owned = ProcessOwnedPidsByPidOrDescendant(item.PID, list, ownedMarkers, ['SamWaf'])
    for (const pid of owned) {
      if (!exclude.has(pid) && !extra.includes(pid)) extra.push(pid)
    }
  }
  return extra
}
