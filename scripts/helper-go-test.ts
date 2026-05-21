import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const helperDir = path.join(repoRoot, 'src/helper-go')
const bundledWindowsGo = 'D:\\Program Files\\PhpWebStudy-Data\\app\\static-go-1.25.0\\bin\\go.exe'

function findGoBinary() {
  if (process.env.FLYENV_GO) return process.env.FLYENV_GO
  if (process.platform === 'win32' && fs.existsSync(bundledWindowsGo)) return bundledWindowsGo
  return 'go'
}

const mode = process.argv[2] ?? 'test'
const go = findGoBinary()
let args = mode === 'vet' ? ['vet', './...'] : ['test', './...']

if (mode === 'test' && process.platform === 'win32') {
  console.warn(
    'helper-go-test: skipping helper-go main package on Windows non-admin run; use yarn run test:helper:go:admin for the full Windows test binary'
  )
  args = ['test', './module', './utils']
}

const result = spawnSync(go, args, {
  cwd: helperDir,
  stdio: 'inherit',
  shell: false
})

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 1)
