import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  PGADMIN4_PACKAGE,
  pgAdminBootstrapContent,
  pgAdminConfigContent,
  pgAdminInitializationVerificationContent,
  pgAdminPackageRootProbe,
  pgAdminPaths,
  parsePgAdminServerIdentity,
  pgAdminServerIdentityContent,
  pgAdminServerReconciliationContent,
  pgAdminServersContent
} from '../src/fork/module/Postgresql/pgAdmin'

type PythonRunOptions = {
  cwd?: string
  env?: NodeJS.ProcessEnv
}

function runPython(
  python: string,
  args: string[],
  options: PythonRunOptions = {}
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(python, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf-8')
    child.stderr.setEncoding('utf-8')
    child.stdout.on('data', (data) => {
      stdout += data
    })
    child.stderr.on('data', (data) => {
      stderr += data
    })
    child.once('error', reject)
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }
      reject(
        new Error(
          `pgAdmin integration command failed (${code ?? signal ?? 'unknown'}): ${args.join(' ')}\n${stderr}`
        )
      )
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
  throw new Error(
    'PGADMIN4_INTEGRATION_PYTHON must point to a virtual environment with pgadmin4==9.17'
  )
}
await access(python).catch(() => {
  throw new Error(`PGADMIN4_INTEGRATION_PYTHON is not accessible: ${python}`)
})

const packageVersion = (
  await runPython(python, [
    '-c',
    "from importlib.metadata import version; print(version('pgadmin4'))"
  ])
).stdout.trim()
assert.equal(packageVersion, PGADMIN4_PACKAGE.split('==')[1])

const packageRoot = await packageRootForPython(python)
const configLocal = join(packageRoot, 'config_local.py')
const originalConfigLocal = await readOptional(configLocal)
const temporaryRoot = await mkdtemp(join(tmpdir(), 'flyenv-pgadmin4-integration-'))
const paths = pgAdminPaths(temporaryRoot, false)
const setupEmail = `flyenv-setup-${randomBytes(8).toString('hex')}@example.com`
const setupPassword = `FlyEnv-setup-${randomBytes(16).toString('hex')}`
const email = `flyenv-retry-${randomBytes(8).toString('hex')}@example.com`
const password = `FlyEnv-retry-${randomBytes(16).toString('hex')}`
const postgreSqlPort = 15432

try {
  await mkdir(paths.data, { recursive: true })
  await mkdir(paths.log, { recursive: true })
  await writeFile(configLocal, pgAdminConfigContent(paths.data, paths.log, 5050))
  await writeFile(paths.servers, pgAdminServersContent(postgreSqlPort))
  await writeFile(paths.bootstrap, pgAdminBootstrapContent())
  await writeFile(paths.verification, pgAdminInitializationVerificationContent())
  await writeFile(paths.identityScript, pgAdminServerIdentityContent())
  await writeFile(paths.reconciliation, pgAdminServerReconciliationContent())

  await runPython(python, [join(packageRoot, 'setup.py'), 'setup-db'], {
    cwd: packageRoot,
    env: {
      PGADMIN_SETUP_EMAIL: setupEmail,
      PGADMIN_SETUP_PASSWORD: setupPassword
    }
  })
  await runPython(python, [paths.bootstrap, packageRoot, setupEmail], { cwd: packageRoot })
  await runPython(python, [paths.bootstrap, packageRoot, email], {
    cwd: packageRoot,
    env: { PGADMIN_SETUP_PASSWORD: password }
  })
  const loadServers = await runPython(
    python,
    [join(packageRoot, 'setup.py'), 'load-servers', paths.servers, '--user', email],
    { cwd: packageRoot }
  )
  assert.match(loadServers.stdout, /Added 0 Server Group\(s\) and 1 Server\(s\)\./)
  await runPython(python, [paths.bootstrap, packageRoot, email, `${postgreSqlPort}`], {
    cwd: packageRoot
  })
  await runPython(python, [paths.verification, packageRoot, email, `${postgreSqlPort}`], {
    cwd: packageRoot
  })
  const serverIdentity = parsePgAdminServerIdentity(
    (
      await runPython(python, [paths.identityScript, packageRoot, email, `${postgreSqlPort}`], {
        cwd: packageRoot
      })
    ).stdout
  )
  assert.ok(serverIdentity.userId > 0)
  assert.ok(serverIdentity.serverId > 0)
  await writeFile(paths.identity, JSON.stringify(serverIdentity))
  assert.deepEqual(JSON.parse(await readFile(paths.identity, 'utf-8')), serverIdentity)

  const stateScript = `import json
import sys

package_root = sys.argv[1]
if package_root not in sys.path:
    sys.path.insert(0, package_root)

import config
from pgadmin import create_app
from pgadmin.model import Server, User
from pgadmin.utils.constants import INTERNAL

email = sys.argv[2]
postgresql_port = int(sys.argv[3])
app = create_app(config.APP_NAME + '-cli')

with app.app_context():
    user = User.query.filter_by(username=email, auth_source=INTERNAL).first()
    if user is None or not user.active or not any(role.name == 'Administrator' for role in user.roles):
        raise RuntimeError('Administrator was not persisted')
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
    print(json.dumps({
        'active': user.active,
        'auth_source': user.auth_source,
        'administrator': any(role.name == 'Administrator' for role in user.roles),
        'group': server.servergroup.name,
        'host': server.host,
        'port': server.port,
        'maintenance_db': server.maintenance_db,
        'username': server.username,
        'sslmode': connection_params.get('sslmode'),
        'save_password': server.save_password,
        'password_empty': not bool(server.password),
    }))
`
  const state = JSON.parse(
    (
      await runPython(python, ['-c', stateScript, packageRoot, email, `${postgreSqlPort}`], {
        cwd: packageRoot
      })
    ).stdout.trim()
  )
  assert.deepEqual(state, {
    active: true,
    auth_source: 'internal',
    administrator: true,
    group: 'Servers',
    host: '127.0.0.1',
    port: postgreSqlPort,
    maintenance_db: 'postgres',
    username: 'root',
    sslmode: 'prefer',
    save_password: 0,
    password_empty: true
  })

  const targetPortBeforeReconciliation = 15431
  const siblingPort = 15430
  const seedScript = `import json
import sys

package_root = sys.argv[1]
if package_root not in sys.path:
    sys.path.insert(0, package_root)

import config
from pgadmin import create_app
from pgadmin.model import Server, User, db
from pgadmin.utils.constants import INTERNAL

email = sys.argv[2]
target_id = int(sys.argv[3])
target_port = int(sys.argv[4])
sibling_port = int(sys.argv[5])
app = create_app(config.APP_NAME + '-cli')

with app.app_context():
    user = User.query.filter_by(username=email, auth_source=INTERNAL).first()
    target = Server.query.filter_by(
        id=target_id,
        user_id=user.id,
        name='FlyEnv PostgreSQL',
        host='127.0.0.1',
        maintenance_db='postgres',
        username='root',
    ).first()
    if target is None:
        raise RuntimeError('FlyEnv target server was not found')
    target.port = target_port
    target.password = 'target-manual-password'
    target.save_password = 1
    target.connection_params = {'sslmode': 'require'}
    sibling = target.clone()
    sibling.port = sibling_port
    sibling.password = 'sibling-manual-password'
    sibling.save_password = 1
    sibling.connection_params = {'sslmode': 'verify-full'}
    db.session.add(sibling)
    db.session.commit()
    print(json.dumps({'targetId': target.id, 'siblingId': sibling.id}))
`
  const seeded = JSON.parse(
    (
      await runPython(
        python,
        [
          '-c',
          seedScript,
          packageRoot,
          email,
          `${serverIdentity.serverId}`,
          `${targetPortBeforeReconciliation}`,
          `${siblingPort}`
        ],
        { cwd: packageRoot }
      )
    ).stdout.trim()
  )
  assert.equal(seeded.targetId, serverIdentity.serverId)
  assert.ok(seeded.siblingId > 0)

  const reconciledPostgreSqlPort = 15433
  await runPython(
    python,
    [
      paths.reconciliation,
      packageRoot,
      `${serverIdentity.userId}`,
      `${serverIdentity.serverId}`,
      `${reconciledPostgreSqlPort}`
    ],
    {
      cwd: packageRoot
    }
  )
  const isolatedStateScript = `import json
import sys

package_root = sys.argv[1]
if package_root not in sys.path:
    sys.path.insert(0, package_root)

import config
from pgadmin import create_app
from pgadmin.model import Server, User
from pgadmin.utils.constants import INTERNAL

email = sys.argv[2]
target_id = int(sys.argv[3])
sibling_id = int(sys.argv[4])
app = create_app(config.APP_NAME + '-cli')

with app.app_context():
    user = User.query.filter_by(username=email, auth_source=INTERNAL).first()
    target = Server.query.filter_by(id=target_id, user_id=user.id).first()
    sibling = Server.query.filter_by(id=sibling_id, user_id=user.id).first()
    if target is None or sibling is None:
        raise RuntimeError('Expected server records were not found')
    target_params = target.connection_params or {}
    sibling_params = sibling.connection_params or {}
    print(json.dumps({
        'target': {
            'port': target.port,
            'sslmode': target_params.get('sslmode'),
            'save_password': target.save_password,
            'password_empty': not bool(target.password),
        },
        'sibling': {
            'port': sibling.port,
            'sslmode': sibling_params.get('sslmode'),
            'save_password': sibling.save_password,
            'password_empty': not bool(sibling.password),
        },
    }))
`
  const isolatedState = JSON.parse(
    (
      await runPython(
        python,
        [
          '-c',
          isolatedStateScript,
          packageRoot,
          email,
          `${serverIdentity.serverId}`,
          `${seeded.siblingId}`
        ],
        { cwd: packageRoot }
      )
    ).stdout.trim()
  )
  assert.deepEqual(isolatedState, {
    target: {
      port: reconciledPostgreSqlPort,
      sslmode: 'prefer',
      save_password: 0,
      password_empty: true
    },
    sibling: {
      port: siblingPort,
      sslmode: 'verify-full',
      save_password: 1,
      password_empty: false
    }
  })

  console.log('pgAdmin 4 upstream integration test passed')
} finally {
  if (originalConfigLocal === undefined) {
    await rm(configLocal, { force: true })
  } else {
    await writeFile(configLocal, originalConfigLocal)
  }
  await rm(temporaryRoot, { recursive: true, force: true })
}
