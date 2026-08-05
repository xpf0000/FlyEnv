import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  pgAdminConfigContent,
  pgAdminDesktopBootstrapContent,
  pgAdminDesktopInitializationVerificationContent,
  pgAdminDesktopServerIdentityContent,
  pgAdminDesktopServerReconciliationContent,
  pgAdminPackageRootProbe,
  pgAdminPaths,
  parsePgAdminServerIdentity,
  pgAdminServersContent
} from '../src/fork/module/Postgresql/pgAdmin'

type PythonRunOptions = {
  cwd?: string
}

function runPython(
  python: string,
  args: string[],
  options: PythonRunOptions = {}
): Promise<{ stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(python, args, {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    child.stdout.setEncoding('utf-8')
    child.stdout.on('data', (data) => {
      stdout += data
    })
    child.stderr.on('data', () => {})
    child.once('error', reject)
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolve({ stdout })
        return
      }
      reject(new Error(`pgAdmin integration command failed (${code ?? signal ?? 'unknown'})`))
    })
  })
}

async function packageRootForPython(python: string): Promise<string> {
  const result = await runPython(python, ['-c', pgAdminPackageRootProbe()])
  const packageRoot = result.stdout.trim()
  if (!packageRoot) {
    throw new Error('pgAdmin package directory was not found')
  }
  await Promise.all([access(join(packageRoot, 'pgadmin')), access(join(packageRoot, 'setup.py'))])
  return packageRoot
}

async function readOptional(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf-8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    throw error
  }
}

const python = process.env.PGADMIN4_INTEGRATION_PYTHON
if (!python) {
  throw new Error('PGADMIN4_INTEGRATION_PYTHON must point to a virtual environment with pgadmin4')
}
await access(python).catch(() => {
  throw new Error(`PGADMIN4_INTEGRATION_PYTHON is not accessible: ${python}`)
})

const packageRoot = await packageRootForPython(python)
const configLocal = join(packageRoot, 'config_local.py')
const originalConfigLocal = await readOptional(configLocal)
const temporaryRoot = await mkdtemp(join(tmpdir(), 'flyenv-pgadmin4-integration-'))
const paths = pgAdminPaths(temporaryRoot, false)
const postgreSqlPort = 15432

try {
  await mkdir(paths.data, { recursive: true })
  await mkdir(paths.log, { recursive: true })
  await writeFile(configLocal, pgAdminConfigContent(paths.data, paths.log, 5050))
  assert.match(await readFile(configLocal, 'utf-8'), /SERVER_MODE = False/)
  await writeFile(paths.servers, pgAdminServersContent(postgreSqlPort))
  await writeFile(paths.bootstrap, pgAdminDesktopBootstrapContent())
  await writeFile(paths.verification, pgAdminDesktopInitializationVerificationContent())
  await writeFile(paths.identityScript, pgAdminDesktopServerIdentityContent())
  await writeFile(paths.reconciliation, pgAdminDesktopServerReconciliationContent())

  await runPython(python, [join(packageRoot, 'setup.py'), 'setup-db'], { cwd: packageRoot })
  await runPython(python, [paths.bootstrap, packageRoot], { cwd: packageRoot })
  const loadServers = await runPython(
    python,
    [join(packageRoot, 'setup.py'), 'load-servers', paths.servers],
    { cwd: packageRoot }
  )
  assert.match(loadServers.stdout, /Added 0 Server Group\(s\) and 1 Server\(s\)\./)
  await runPython(python, [paths.bootstrap, packageRoot, `${postgreSqlPort}`], {
    cwd: packageRoot
  })
  await runPython(python, [paths.verification, packageRoot, `${postgreSqlPort}`], {
    cwd: packageRoot
  })
  const serverIdentity = parsePgAdminServerIdentity(
    (
      await runPython(python, [paths.identityScript, packageRoot, `${postgreSqlPort}`], {
        cwd: packageRoot
      })
    ).stdout
  )
  assert.match(serverIdentity.userId, /^[1-9]\d*$/)
  assert.match(serverIdentity.serverId, /^[1-9]\d*$/)
  await writeFile(paths.identity, JSON.stringify(serverIdentity))
  assert.deepEqual(JSON.parse(await readFile(paths.identity, 'utf-8')), serverIdentity)

  await runPython(
    python,
    [
      paths.reconciliation,
      packageRoot,
      `${serverIdentity.userId}`,
      `${serverIdentity.serverId}`,
      `${postgreSqlPort}`
    ],
    { cwd: packageRoot }
  )

  const stateScript = `import json
import sys

package_root = sys.argv[1]
if package_root not in sys.path:
    sys.path.insert(0, package_root)

import config
from pgadmin import create_app
from pgadmin.model import Server, User
from pgadmin.utils.constants import INTERNAL

postgresql_port = int(sys.argv[2])
app = create_app(config.APP_NAME + '-cli')

with app.app_context():
    user = User.query.filter_by(username=config.DESKTOP_USER, auth_source=INTERNAL).first()
    if (
        user is None
        or not user.active
        or user.auth_source != INTERNAL
        or not any(role.name == 'Administrator' for role in user.roles)
    ):
        raise RuntimeError('Desktop default user was not persisted')
    server = Server.query.filter_by(
        user_id=user.id,
        name='FlyEnv PostgreSQL',
        host='127.0.0.1',
        port=postgresql_port,
        maintenance_db='postgres',
        username='root',
        save_password=0,
    ).first()
    if server is None or server.servergroup is None or server.servergroup.name != 'Servers':
        raise RuntimeError('FlyEnv PostgreSQL server was not persisted')
    connection_params = server.connection_params or {}
    if connection_params.get('sslmode') != 'prefer' or server.password:
        raise RuntimeError('FlyEnv PostgreSQL security settings were not persisted')
    with app.test_client() as client:
        response = client.get('/', follow_redirects=True)
    if response.status_code != 200 or response.request.path.endswith('/login'):
        raise RuntimeError('Desktop request did not auto-authenticate')
    print(json.dumps({
        'desktop_default_user': True,
        'administrator': any(role.name == 'Administrator' for role in user.roles),
        'group': server.servergroup.name,
        'host': server.host,
        'port': server.port,
        'maintenance_db': server.maintenance_db,
        'username': server.username,
        'sslmode': connection_params.get('sslmode'),
        'save_password': server.save_password,
        'password_empty': not bool(server.password),
        'http_auto_authenticated': True,
    }))
`
  const state = JSON.parse(
    (
      await runPython(python, ['-c', stateScript, packageRoot, `${postgreSqlPort}`], {
        cwd: packageRoot
      })
    ).stdout.trim()
  )
  assert.deepEqual(state, {
    desktop_default_user: true,
    administrator: true,
    group: 'Servers',
    host: '127.0.0.1',
    port: postgreSqlPort,
    maintenance_db: 'postgres',
    username: 'root',
    sslmode: 'prefer',
    save_password: 0,
    password_empty: true,
    http_auto_authenticated: true
  })

  console.log('pgAdmin 4 desktop-mode upstream integration test passed')
} finally {
  if (originalConfigLocal === undefined) {
    await rm(configLocal, { force: true })
  } else {
    await writeFile(configLocal, originalConfigLocal)
  }
  await rm(temporaryRoot, { recursive: true, force: true })
}
