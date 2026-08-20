import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { zipUnpack } from '../src/fork/util/Zip'
import { installRustWindowsArchive, rustVersionSearchDirs } from '../src/fork/module/Rust'

const execFileAsync = promisify(execFile)
const workspace = await mkdtemp(join(tmpdir(), 'flyenv-rust-install-'))
const sourceRoot = join(workspace, 'source')
const packageRoot = join(sourceRoot, 'rust-1.97.1-x86_64-pc-windows-msvc')
const archive = join(workspace, 'rust-1.97.1.tar.xz')
const destination = join(workspace, 'destination')
const appDir = join(workspace, 'app')
const installedDir = join(appDir, 'rust', '1.97.1')

try {
  await mkdir(join(packageRoot, 'cargo', 'bin'), { recursive: true })
  await mkdir(join(packageRoot, 'rustc', 'bin'), { recursive: true })
  await writeFile(join(packageRoot, 'cargo', 'bin', 'cargo.exe'), 'cargo')
  await writeFile(join(packageRoot, 'rustc', 'bin', 'rustc.exe'), 'rustc')
  await execFileAsync('tar', [
    '-cJf',
    archive,
    '-C',
    sourceRoot,
    'rust-1.97.1-x86_64-pc-windows-msvc'
  ])

  global.Server = {
    BaseDir: workspace,
    Cache: workspace,
    Static: join(workspace, 'static'),
    AppDir: appDir
  } as any
  await mkdir(destination, { recursive: true })
  await zipUnpack(archive, destination)

  const extractedRoot = join(destination, 'rust-1.97.1-x86_64-pc-windows-msvc')
  assert.equal(existsSync(join(extractedRoot, 'cargo', 'bin', 'cargo.exe')), true)
  assert.equal(existsSync(join(extractedRoot, 'rustc', 'bin', 'rustc.exe')), true)
  assert.equal(existsSync(join(destination, 'rust-1.97.1.tar')), false)

  assert.deepEqual(
    rustVersionSearchDirs({ rust: { dirs: ['C:/custom-rust'] } }, appDir, ['1.97.1']),
    ['C:/custom-rust', installedDir]
  )

  await installRustWindowsArchive(archive, installedDir)
  assert.equal(existsSync(join(installedDir, 'cargo', 'bin', 'cargo.exe')), true)
  assert.equal(existsSync(join(installedDir, 'rustc', 'bin', 'rustc.exe')), true)
  assert.equal(
    existsSync(
      join(installedDir, 'rust-1.97.1-x86_64-pc-windows-msvc', 'cargo', 'bin', 'cargo.exe')
    ),
    false
  )

  const rustModuleSource = readFileSync('src/fork/module/Rust/index.ts', 'utf8')
  assert.match(
    rustModuleSource,
    /const customDirs = rustVersionSearchDirs\(setup, global\.Server\.AppDir!, managedVersions\)/
  )
  assert.match(rustModuleSource, /await installRustWindowsArchive\(row\.zip, row\.appDir\)/)
  assert.doesNotMatch(rustModuleSource, /const cacheDir = join\(global\.Server\.Cache!, uuid\(\)\)/)
  assert.doesNotMatch(
    rustModuleSource,
    /const find = files\.find\(\(f\) => f\.includes\('\.tar'\)\)/
  )
  assert.doesNotMatch(rustModuleSource, /await zipUnpack\(join\(cacheDir, find\), row\.appDir\)/)

  const staticItemSource = readFileSync('src/render/core/Module/ModuleStaticItem.ts', 'utf8')
  assert.match(staticItemSource, /this\.installed = true\s*\n\s*resolve\(true\)/)
} finally {
  await rm(workspace, { recursive: true, force: true })
}

console.log('rust windows install tests passed')
