import { TaskQueue } from '@shared/TaskQueue'

export interface AiCliSessionRecord {
  id: string
  updatedAt: string
}

export async function runAiCliSessionTasks<T>(
  tasks: Array<() => Promise<T>>
): Promise<Array<T | undefined>> {
  const results: Array<T | undefined> = Array.from({ length: tasks.length })
  if (!tasks.length) {
    return results
  }

  return new Promise((resolve) => {
    new TaskQueue(4)
      .initQueue(
        tasks.map((task, index) => ({
          run: async () => {
            try {
              results[index] = await task()
            } catch {
              // A malformed or unavailable session file must not fail the whole list.
            }
            return true
          }
        }))
      )
      .end(() => resolve(results))
      .run()
  })
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
