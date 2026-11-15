import { homedir } from 'node:os'
import { join } from 'node:path'
export function claudeMcpConfigPath(home = homedir(), env: NodeJS.ProcessEnv = process.env) {
  return join(env.CLAUDE_CONFIG_DIR || home, '.claude.json')
}
