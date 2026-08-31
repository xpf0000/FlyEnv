import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { chmod, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { moveProjectDirContents } from '../src/fork/module/Project/ProjectDirMover'
import Project from '../src/fork/module/Project'

const execFileAsync = promisify(execFile)

async function withWorkspace(run: (workspace: string) => Promise<void>) {
  const workspace = await mkdtemp(join(tmpdir(), 'flyenv-php-project-'))
  try {
    await run(workspace)
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
}

async function movesDotfilesSymlinksAndDirectories() {
  await withWorkspace(async (workspace) => {
    const destination = join(workspace, 'project')
    const staging = join(destination, 'flyenv-create-project')
    await mkdir(join(staging, 'vendor', 'composer'), { recursive: true })
    await writeFile(join(staging, '.env'), 'APP_ENV=local\n')
    await writeFile(join(staging, '.gitignore'), '/vendor\n')
    await writeFile(join(staging, 'vendor', 'composer', 'installed.json'), '{}\n')
    await symlink('.env', join(staging, '.env-link'))

    await moveProjectDirContents(staging, destination)

    assert.equal(existsSync(join(destination, '.env')), true)
    assert.equal(existsSync(join(destination, '.gitignore')), true)
    assert.equal(existsSync(join(destination, '.env-link')), true)
    assert.equal(existsSync(join(destination, 'vendor', 'composer', 'installed.json')), true)
    assert.equal(existsSync(staging), true)
    assert.deepEqual(await readdir(staging), [])
  })
}

async function mergesSameNamedDirectories() {
  await withWorkspace(async (workspace) => {
    const destination = join(workspace, 'project')
    const staging = join(destination, 'flyenv-create-project')
    await mkdir(join(destination, 'vendor'), { recursive: true })
    await mkdir(join(staging, 'vendor'), { recursive: true })
    await writeFile(join(destination, 'vendor', 'existing.txt'), 'existing\n')
    await writeFile(join(staging, 'vendor', 'new.txt'), 'new\n')

    await moveProjectDirContents(staging, destination)

    assert.equal(await readFile(join(destination, 'vendor', 'existing.txt'), 'utf8'), 'existing\n')
    assert.equal(await readFile(join(destination, 'vendor', 'new.txt'), 'utf8'), 'new\n')
    assert.deepEqual(await readdir(staging), [])
  })
}

async function rejectsNonDirectoryCollisionsWithoutOverwriting() {
  await withWorkspace(async (workspace) => {
    const destination = join(workspace, 'project')
    const staging = join(destination, 'flyenv-create-project')
    await mkdir(staging, { recursive: true })
    await writeFile(join(destination, '.env'), 'APP_ENV=production\n')
    await writeFile(join(staging, '.env'), 'APP_ENV=local\n')

    await assert.rejects(
      moveProjectDirContents(staging, destination),
      (error: NodeJS.ErrnoException) => {
        assert.equal(error.code, 'EEXIST')
        return true
      }
    )
    assert.equal(await readFile(join(destination, '.env'), 'utf8'), 'APP_ENV=production\n')
    assert.equal(await readFile(join(staging, '.env'), 'utf8'), 'APP_ENV=local\n')
  })
}

async function projectMigrationPreservesStagingAfterACollision() {
  await withWorkspace(async (workspace) => {
    const destination = join(workspace, 'project')
    const staging = join(destination, 'flyenv-create-project')
    await mkdir(staging, { recursive: true })
    await writeFile(join(destination, '.env'), 'APP_ENV=production\n')
    await writeFile(join(staging, '.env'), 'APP_ENV=local\n')

    await assert.rejects(
      new Promise((resolve, reject) => {
        Project.handleProjectDir(destination, 'symfony').then(resolve, reject)
      })
    )
    assert.equal(await readFile(join(destination, '.env'), 'utf8'), 'APP_ENV=production\n')
    assert.equal(await readFile(join(staging, '.env'), 'utf8'), 'APP_ENV=local\n')
  })
}

async function legacyProjectScriptMovesDotfiles(script: string) {
  await withWorkspace(async (workspace) => {
    const projectDir = join(workspace, 'project')
    const binDir = join(workspace, 'bin')
    const composer = join(binDir, 'composer')
    const php = join(binDir, 'php')
    await mkdir(projectDir, { recursive: true })
    await mkdir(binDir, { recursive: true })
    await writeFile(php, '#!/bin/bash\nexit 0\n')
    await writeFile(
      composer,
      `#!/bin/bash
if [ "$1" = "create-project" ]; then
  project="$PWD/$4"
  mkdir -p "$project/vendor/composer"
  printf 'APP_ENV=local\\n' > "$project/.env"
  printf '/vendor\\n' > "$project/.gitignore"
  printf '{}\\n' > "$project/vendor/composer/installed.json"
  ln -s .env "$project/.env-link"
fi
`
    )
    await chmod(php, 0o755)
    await chmod(composer, 0o755)

    await execFileAsync('bash', [
      script,
      workspace,
      projectDir,
      'example/framework',
      '1.0.0',
      binDir
    ])

    assert.equal(existsSync(join(projectDir, '.env')), true)
    assert.equal(existsSync(join(projectDir, '.gitignore')), true)
    assert.equal(existsSync(join(projectDir, '.env-link')), true)
    assert.equal(existsSync(join(projectDir, 'vendor', 'composer', 'installed.json')), true)
    assert.equal(existsSync(join(projectDir, 'flyenv-created-project')), false)
  })
}

async function legacyProjectScriptsPreserveDotfiles() {
  const root = join(import.meta.dirname, '..')
  await legacyProjectScriptMovesDotfiles(join(root, 'static', 'sh', 'macOS', 'project-new.sh'))
  await legacyProjectScriptMovesDotfiles(join(root, 'static', 'sh', 'Linux', 'project-new.sh'))
  assert.equal(existsSync(join(root, 'static', 'sh', 'Windows', 'project-new.cmd')), false)
}

await movesDotfilesSymlinksAndDirectories()
await mergesSameNamedDirectories()
await rejectsNonDirectoryCollisionsWithoutOverwriting()
await projectMigrationPreservesStagingAfterACollision()
await legacyProjectScriptsPreserveDotfiles()

console.log('php project directory tests passed')
