import { createServer } from 'node:net'
import { join } from 'node:path'

export const PGADMIN4_PACKAGE = 'pgadmin4==9.17'
export const PGADMIN4_DEFAULT_PORT = 5050

export interface PgAdminCredentials {
  email: string
  password: string
}

export interface PgAdminPaths {
  root: string
  data: string
  log: string
  pid: string
  port: string
  servers: string
  venv: string
  python: string
}

export function pgAdminPaths(postgreSqlDir: string, windows: boolean): PgAdminPaths {
  const root = join(postgreSqlDir, 'pgadmin4')
  const venv = join(root, 'venv')

  return {
    root,
    data: join(root, 'data'),
    log: join(root, 'pgadmin4.log'),
    pid: join(root, 'pgadmin4.pid'),
    port: join(root, 'pgadmin4.port'),
    servers: join(root, 'servers.json'),
    venv,
    python: windows ? join(venv, 'Scripts', 'python.exe') : join(venv, 'bin', 'python')
  }
}

export function pgAdminUrl(port: number): string {
  return `http://127.0.0.1:${port}`
}

export function pgAdminConfigContent(dataDir: string, port: number): string {
  return `DEFAULT_SERVER = "127.0.0.1"\nDEFAULT_SERVER_PORT = ${port}\nDATA_DIR = ${JSON.stringify(dataDir)}\n`
}

export function postgresqlPortFromConfig(content: string): number {
  const match = /^\s*port\s*=\s*(?:"(\d+)"|'(\d+)'|(\d+))\s*(?:#.*)?$/im.exec(content)
  const port = Number(match?.[1] ?? match?.[2] ?? match?.[3])

  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : 5432
}

export function pgAdminServersContent(port: number): string {
  return `${JSON.stringify(
    {
      Servers: {
        1: {
          Name: 'FlyEnv PostgreSQL',
          Host: '127.0.0.1',
          Port: port,
          MaintenanceDB: 'postgres',
          Username: 'root',
          SSLMode: 'prefer'
        }
      }
    },
    null,
    2
  )}\n`
}

export function validPgAdminCredentials(credentials?: PgAdminCredentials | null): boolean {
  return !!(
    credentials &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(credentials.email) &&
    credentials.password.length >= 8
  )
}

export function validPgAdminPythonVersion(version: string): boolean {
  const match = /^(?:Python\s+)?(\d+)\.(\d+)(?:\.\d+)?\s*$/.exec(version.trim())
  if (!match) return false

  const major = Number(match[1])
  const minor = Number(match[2])
  return major > 3 || (major === 3 && minor >= 9)
}

function canBindLoopback(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    const finish = (available: boolean) => {
      server.removeAllListeners()
      resolve(available)
    }

    server.once('error', () => finish(false))
    server.listen({ host: '127.0.0.1', port }, () => {
      server.close(() => finish(true))
    })
  })
}

export async function findPgAdminPort(start = PGADMIN4_DEFAULT_PORT): Promise<number> {
  for (let port = start; port <= start + 20; port += 1) {
    if (await canBindLoopback(port)) return port
  }

  throw new Error(`No pgAdmin 4 loopback port is available between ${start} and ${start + 20}`)
}
