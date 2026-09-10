import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(join(process.cwd(), 'src/fork/module/Podman/index.ts'), 'utf-8')

assert.match(
  source,
  /const env = await EnvSync\.sync\(\)[\s\S]*?env\.XDG_CONFIG_HOME \|\| join\(homedir\(\), '\.config'\)/,
  "Rosetta config must use the XDG_CONFIG_HOME from Podman's synchronized shell environment"
)

console.log('Podman Rosetta config path checks passed')
