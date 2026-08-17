export interface AiCliSessionRecord {
  id: string
  updatedAt: string
}

function parseUpdatedAt(value: string): number | undefined {
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? undefined : timestamp
}

export function dedupeAiCliSessions<T extends AiCliSessionRecord>(sessions: T[]): T[] {
  const sessionsById = new Map<string, T>()

  for (const session of sessions) {
    if (!session.id) {
      continue
    }

    const existing = sessionsById.get(session.id)
    if (!existing) {
      sessionsById.set(session.id, session)
      continue
    }

    const nextTimestamp = parseUpdatedAt(session.updatedAt)
    const existingTimestamp = parseUpdatedAt(existing.updatedAt)
    if (
      nextTimestamp !== undefined &&
      (existingTimestamp === undefined || nextTimestamp > existingTimestamp)
    ) {
      sessionsById.set(session.id, session)
    }
  }

  return [...sessionsById.values()]
}
