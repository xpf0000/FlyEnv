import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile, realpath } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { dbGateInstallEnv, dbGateInstallManifest, type DbGatePaths } from '@fork/module/DbGate'

/** Fork-owned installer; preserve workspace/credentials and report the actual npm terminal result. */
export async function installDbGate(
  nodeBin: string,
  paths: DbGatePaths,
  options: { npmCli?: string } = {}
): Promise<void> {
  const windows = process.platform === 'win32'
  const nodeDir = dirname(nodeBin)
  const npmCli =
    options.npmCli ??
    [
      join(nodeDir, 'node_modules/npm/bin/npm-cli.js'),
      join(dirname(nodeDir), 'lib/node_modules/npm/bin/npm-cli.js')
    ].find((candidate) => existsSync(candidate))
  const npm = !windows && join(nodeDir, 'npm')
  if (!npmCli && (!npm || !existsSync(npm)))
    throw new Error(`NodeJS npm is unavailable: ${nodeBin}`)
  await mkdir(paths.root, { recursive: true })
  // npm must see the same canonical root as child cwd; aliases can bypass overrides.
  const installRoot = await realpath(paths.root)
  const manifestPath = join(installRoot, 'package.json')
  let current: any = {}
  if (existsSync(manifestPath)) current = JSON.parse(await readFile(manifestPath, 'utf8'))
  const defaults = dbGateInstallManifest()
  const manifest = {
    ...current,
    ...defaults,
    dependencies: { ...current.dependencies, ...defaults.dependencies },
    overrides: { ...current.overrides, ...defaults.overrides, 'dbgate-mysql-dumper': '0.1.3' }
  }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  const args = [
    'install',
    '--loglevel',
    'error',
    '--prefix',
    installRoot,
    '--global=false',
    '--dry-run=false',
    '--package-lock-only=false',
    '--no-package-lock',
    '--no-audit',
    '--no-fund'
  ]
  // Install the manifest, retaining the published dumper overrides and custom dependencies.
  const output = await new Promise<string>((resolve, reject) => {
    let tail = ''
    const append = (data: Buffer) => {
      tail = (tail + data.toString()).slice(-8000)
    }
    const child = spawn(npmCli ? nodeBin : (npm as string), npmCli ? [npmCli, ...args] : args, {
      cwd: installRoot,
      shell: false,
      ...(windows ? {} : { env: dbGateInstallEnv(nodeDir, false) })
    })
    child.stdout.on('data', append)
    child.stderr.on('data', append)
    child.on('error', reject)
    // exit can precede drained output; null exit code means a signal, never success.
    child.on('close', (code, signal) => {
      if (code === 0 && !signal) resolve(tail)
      else
        reject(
          new Error(
            `DbGate npm installation failed (code=${code}, signal=${signal ?? 'none'})\n${tail}`
          )
        )
    })
  })
  if (!existsSync(paths.entry))
    throw new Error(
      `DbGate package installation did not produce its entry script: ${paths.entry}\n${output}`
    )
}
