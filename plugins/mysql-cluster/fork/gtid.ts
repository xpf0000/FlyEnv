type Interval = [bigint, bigint]
function parse(value: string): Map<string, Interval[]> {
  if (typeof value !== 'string') throw new Error('Unknown or invalid GTID set')
  const sets = new Map<string, Interval[]>()
  for (const raw of value.split(',').map(s => s.trim()).filter(Boolean)) {
    const [uuid, ...parts] = raw.split(':')
    if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(uuid) || !parts.length) throw new Error('Invalid or unsupported GTID set')
    const intervals = sets.get(uuid.toLowerCase()) ?? []
    for (const part of parts) {
      if (!/^\d+(?:-\d+)?$/.test(part)) throw new Error('Invalid or unsupported GTID interval')
      const [first, last] = part.split('-').map(BigInt), end = last ?? first
      if (first < 1n || end < first) throw new Error('Invalid GTID interval')
      intervals.push([first, end])
    }
    intervals.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)
    const merged: Interval[] = []
    for (const [start, end] of intervals) {
      const previous = merged.at(-1)
      if (previous && start <= previous[1] + 1n) previous[1] = end > previous[1] ? end : previous[1]
      else merged.push([start, end])
    }
    sets.set(uuid.toLowerCase(), merged)
  }
  return sets
}
export function isGtidSubset(a: string, b: string): boolean {
  const left = parse(a), right = parse(b)
  return [...left].every(([uuid, values]) => values.every(([start, end]) => right.get(uuid)?.some(([lo, hi]) => start >= lo && end <= hi)))
}
export function chooseRecoveryCandidate(members: { id: string; executed: string; received: string }[]): string {
  if (!members.length) throw new Error('Unknown members')
  for (const member of members) if (!isGtidSubset(member.received, member.executed)) throw new Error('Unapplied recovered transactions require manual inspection')
  const candidate = members.find(m => members.every(other => isGtidSubset(other.executed, m.executed)))
  if (!candidate) throw new Error('Divergent transaction histories; automatic bootstrap is unsafe')
  return candidate.id
}
