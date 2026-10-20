import { join } from 'node:path'
export function instancePaths(root: string, id: string) {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error('Invalid instance ID')
  const dir = join(root, 'instances', id)
  return { dir, config: join(dir, 'my.cnf'), pid: join(dir, 'mysql.pid'), error: join(dir, 'error.log'), slow: join(dir, 'slow.log'), init: join(dir, 'initialize.sql') }
}
export type InstancePaths = ReturnType<typeof instancePaths>
