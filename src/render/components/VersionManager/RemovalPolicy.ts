export interface RemovalCandidate {
  source?: string
  name?: string
  path?: string
  bin?: string
  version?: string | null
}
export type RemovalGuard = (candidate: RemovalCandidate) => Promise<boolean>
export async function guardedRemoval<T>(
  candidate: RemovalCandidate,
  guard: RemovalGuard | undefined,
  action: () => T | Promise<T>
): Promise<T | undefined> {
  if (guard && !(await guard(candidate))) return undefined
  return action()
}
