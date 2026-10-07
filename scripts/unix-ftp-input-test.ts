import assert from 'node:assert/strict'
import { mkdtemp, writeFile, chmod, symlink, mkdir, rm } from 'node:fs/promises'
import { tmpdir, userInfo } from 'node:os'
import { join } from 'node:path'
import { readUnixFTPInputs } from '../src/fork/module/PureFtpd/HelperInputs'

const root = await mkdtemp(join(tmpdir(), 'flyenv-ftp-input-'))
const alias = join(root, 'alias')
const real = join(root, 'data')
await mkdir(real)
await symlink(real, alias)
global.Server = { FTPDir: alias } as any
try {
  await writeFile(join(real, 'pure-ftpd.conf'), 'Bind 127.0.0.1,21\n')
  assert.deepEqual(await readUnixFTPInputs(true), { config: 'Bind 127.0.0.1,21\n', users: '' })
  const passwd = join(real, 'pureftpd.passwd')
  await writeFile(passwd, 'alice:hash:0:0::/shared/home\n', { mode: 0o444 })
  assert.deepEqual(await readUnixFTPInputs(), { users: 'alice:hash:0:0::/shared/home\n' })
  // Ownership is not a read permission check; actual denied access must remain an error.
  if (process.platform !== 'win32' && userInfo().uid !== 0) {
    await chmod(passwd, 0)
    await assert.rejects(readUnixFTPInputs(), (error: any) => error.code === 'EACCES')
    await chmod(passwd, 0o600)
  }
  await writeFile(passwd, 'x'.repeat(1024 * 1024 + 1))
  await assert.rejects(readUnixFTPInputs(), /size limit|Invalid FTP input/)
  await writeFile(passwd, '\n'.repeat(600 * 1024))
  await assert.rejects(readUnixFTPInputs(), /request size limit/)
  await rm(passwd)
  await mkdir(passwd)
  await assert.rejects(readUnixFTPInputs(), /Invalid FTP input/)
  console.log(
    'Ordinary FTP snapshots: aliases, shared-readable inputs, missing users, real read failures and bounds passed'
  )
} finally {
  await rm(root, { recursive: true, force: true })
}
