import { join } from 'path'
import { existsSync, readFileByRoot, writeFileByRoot } from '../../Fn'

export async function updateShellProfiles(update: (content: string) => string) {
  const completed: string[] = []
  const failures: Array<{ file: string; error: unknown }> = []
  for (const name of ['.bashrc', '.zshrc']) {
    const file = join(global.Server.UserHome!, name)
    try {
      const exists = existsSync(file)
      const content = exists ? await readFileByRoot(file) : ''
      const next = update(content)
      if (!exists || next !== content) await writeFileByRoot(file, next)
      completed.push(file)
    } catch (error) {
      failures.push({ file, error })
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(
      failures.map(({ error }) => error),
      `Failed to update shell profiles: ${failures.map(({ file, error }) => `${file}: ${error}`).join('; ')}. Updated: ${completed.join(', ') || 'none'}`
    )
  }
}
