import { basename, join } from 'node:path'
import { createHash } from 'node:crypto'
import { symlink, lstat } from 'node:fs/promises'
import { copy, mkdirp, existsSync } from '@shared/fs-extra'

/** A user-owned basedir view gives legacy install_db its bin/share layout without modifying MacPorts. */
export async function macPortsInstallBase(installedPath: string): Promise<string> {
  if (existsSync(join(installedPath, 'share'))) return installedPath
  const share = join('/opt/local/share', basename(installedPath))
  if (!existsSync(share)) throw new Error(`MacPorts database resources are missing: ${share}`)
  const identity = createHash('sha256').update(installedPath).digest('hex').slice(0, 16)
  const base = join(global.Server.BaseDir!, 'database-resources', identity)
  await mkdirp(base)
  // copy settles only after all required resources are readable; never mark a failed copy ready.
  await copy(share, join(base, 'share'), { dereference: true })
  const bin = join(base, 'bin')
  try {
    const item = await lstat(bin)
    if (!item.isSymbolicLink()) throw new Error(`Unexpected database bin view: ${bin}`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    await symlink(join(installedPath, 'bin'), bin, 'dir')
  }
  return base
}
