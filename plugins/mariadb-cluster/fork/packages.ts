import { readFile, chmod, rm, realpath } from 'node:fs/promises'
import { join, relative, isAbsolute, resolve, dirname, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import { writeAtomic } from './io'
import type { InstanceCatalog } from './catalog'
async function canonical(path: string): Promise<string> {
  try {
    return await realpath(path)
  } catch (error: any) {
    if (error.code !== 'ENOENT') throw error
    const parent = dirname(path)
    if (parent === path) throw error
    return join(await canonical(parent), basename(path))
  }
}
export async function preparePackageCommand(
  root: string,
  source: string,
  name: string,
  installed: boolean,
  options: { staticDir: string; arm: boolean }
) {
  if (
    !['Homebrew', 'Macports'].includes(source) ||
    !/^[a-zA-Z0-9][a-zA-Z0-9@+_./-]*$/.test(name) ||
    name.includes('..') ||
    name.startsWith('/')
  )
    throw new Error('Invalid package identity')
  const action = installed ? 'uninstall' : 'install',
    arch = options.arm ? '-arm64' : '-x86_64'
  const token = randomUUID() + '.sh',
    path = join(root, 'commands', token)
  let text = await readFile(
    join(options.staticDir, 'sh', source === 'Homebrew' ? 'brew-cmd.sh' : 'port-cmd.sh'),
    'utf8'
  )
  if (source === 'Macports') {
    // Do not remove other dependents or deactivate an unrelated library.
    text = text
      .split('\n')
      .filter((line) => !line.includes('libuuid'))
      .join('\n')
      .replaceAll('##ARCH##', arch)
      .replaceAll('##ACTION##', action)
      .replaceAll('##NAME##', `${name} ${name}-server`)
  }
  await writeAtomic(path, text)
  await chmod(path, 0o700)
  return { token, path, args: source === 'Homebrew' ? [arch, action, name] : [] }
}
export async function prepareHomebrewInstall(root: string, staticDir: string, language: string) {
  const token = randomUUID() + '.sh'
  const path = join(root, 'commands', token)
  const name = language === 'zh' ? 'brew-install.sh' : 'brew-install-en.sh'
  await writeAtomic(path, await readFile(join(staticDir, 'sh', name), 'utf8'))
  await chmod(path, 0o700)
  return { token, path, args: [] as string[] }
}
export async function cleanupPackageCommand(root: string, token: string) {
  if (!/^[a-f0-9-]+\.sh$/.test(token)) throw new Error('Invalid command identity')
  await rm(join(root, 'commands', token), { force: true })
}
export async function removeStaticPackage(
  catalog: InstanceCatalog,
  target: string,
  appRoot: string,
  list: () => Promise<{ COMMAND: string }[]>,
  states: () => Promise<{ id: string; state: string }[]>
) {
  const c = await catalog.read()
  return catalog.operations.runMany(
    c.instances.map((i) => i.id),
    'remove-installation',
    async () => {
      const root = await realpath(appRoot),
        path = await realpath(target),
        rel = relative(root, path)
      if (!rel || rel.startsWith('..') || isAbsolute(rel))
        throw new Error('Only FlyEnv-managed packages can be removed here')
      const windows = catalog.platform === 'Windows'
      const norm = (s: string) => {
        s = resolve(s).replace(/\\/g, '/').replace(/\/$/, '')
        return windows ? s.toLowerCase() : s
      }
      const under = (value: string) =>
        norm(value) === norm(path) || norm(value).startsWith(norm(path) + '/')
      if (under(await canonical(catalog.root)))
        throw new Error('The package contains the runtime catalog')
      const references = await Promise.all(
        c.instances.map(async (spec) => ({
          spec,
          data: await canonical(spec.dataDir),
          engine: await canonical(spec.engine.bin)
        }))
      )
      for (const ref of references)
        if (under(ref.data))
          throw new Error(
            'The package contains managed database files; remove it manually without deleting the data'
          )
      const status = await states()
      if (
        references.some(
          (ref) =>
            under(ref.engine) &&
            !status.some((s) => s.id === ref.spec.id && ['stopped', 'missing'].includes(s.state))
        )
      )
        throw new Error('A running or unknown instance uses this package')
      const processes = await list()
      if (
        processes.some(
          (p) =>
            (windows ? p.COMMAND?.replace(/\\/g, '/').toLowerCase() : p.COMMAND) &&
            [path, target].some((candidate) =>
              (windows ? p.COMMAND?.replace(/\\/g, '/').toLowerCase() : p.COMMAND)?.includes(
                norm(candidate) + '/'
              )
            )
        )
      )
        throw new Error('A process still uses this installation')
      await rm(path, { recursive: true })
      return true
    }
  )
}
