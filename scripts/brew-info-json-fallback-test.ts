import assert from 'node:assert/strict'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import EnvSync from '../src/shared/EnvSync'
;(global as any).Server = {
  Proxy: undefined
}

const { brewInfoJson } = await import('../src/fork/util/Version')

const tempDir = await mkdtemp(join(tmpdir(), 'flyenv-brew-info-'))
const brew = join(tempDir, 'brew')

try {
  await writeFile(
    brew,
    `#!/bin/sh
if [ "$1" != "info" ]; then
  exit 2
fi

if [ "$2" = "mongodb/brew/mongodb-community" ] && [ "$3" = "--json" ]; then
  printf '[{"versions":{"stable":"8.0.12"},"installed":[],"full_name":"mongodb/brew/mongodb-community"}]'
  exit 0
fi

if [ "$2" = "mongodb/brew/mongodb-community@8.2" ]; then
  printf '%s\\n' 'Error: No available formula with the name "mongodb/brew/mongodb-community@8.2".' >&2
  exit 1
fi

printf '%s\\n' 'batch failed because one formula is broken' >&2
exit 1
`
  )
  await chmod(brew, 0o755)
  ;(EnvSync as any).AppEnv = {
    ...process.env,
    PATH: tempDir
  }

  const info = await brewInfoJson([
    'mongodb/brew/mongodb-community',
    'mongodb/brew/mongodb-community@8.2'
  ])

  assert.deepEqual(info, [
    {
      version: '8.0.12',
      installed: false,
      name: 'mongodb/brew/mongodb-community',
      flag: 'brew'
    }
  ])

  console.log('brew info json fallback tests passed')
} finally {
  ;(EnvSync as any).clean()
  await rm(tempDir, { force: true, recursive: true })
}

process.exit(0)
