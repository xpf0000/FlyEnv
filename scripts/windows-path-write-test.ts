import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  isSystemPathChangedError,
  joinWindowsPathEntries,
  mergeWindowsPathPriority,
  splitWindowsPathEntries
} from '../src/fork/util/PATH.win'
import {
  buildEnvPathListing,
  buildFlyEnvPreferredPaths,
  isFlyEnvManagedPathEntry,
  isWindowsJunctionOrSymlink,
  readFlyEnvJunctions,
  selectFlyEnvPreferredRoots,
  selectComposerVendorBinEntry
} from '../src/fork/module/Tool.win/path'

async function main() {
  const editorSnapshot = {
    rawPath: 'C:\\FlyEnv\\bin;%SDK%\\bin;relative\\tool;',
    entries: ['C:\\FlyEnv\\bin', '%SDK%\\bin', 'relative\\tool', '']
  }
  const editorListing = await buildEnvPathListing(editorSnapshot, {
    isAbsolute: (entry) => entry === 'C:\\FlyEnv\\bin',
    realpath: (entry) => `${entry}\\resolved`,
    exists: (entry) => entry === 'C:\\FlyEnv\\bin\\resolved' || entry === 'C:\\SDK\\bin',
    expand: async (entry) => (entry === '%SDK%\\bin' ? 'C:\\SDK\\bin' : '')
  })
  assert.deepEqual(editorListing, {
    rawPath: 'C:\\FlyEnv\\bin;%SDK%\\bin;relative\\tool;',
    list: [
      {
        path: 'C:\\FlyEnv\\bin',
        raw: 'C:\\FlyEnv\\bin\\resolved',
        error: false
      },
      {
        path: '%SDK%\\bin',
        raw: 'C:\\SDK\\bin',
        error: false
      },
      {
        path: 'relative\\tool',
        raw: '',
        error: false
      },
      {
        path: '',
        raw: '',
        error: false
      }
    ]
  })

  const rawPath =
    '; C:\\SDK\\bin;;relative\\tool;%INTEL_DEV_REDIST%redist\\intel64\\compiler;C:\\Tools\\;'
  const entries = splitWindowsPathEntries(rawPath)

  assert.deepEqual(entries, [
    '',
    ' C:\\SDK\\bin',
    '',
    'relative\\tool',
    '%INTEL_DEV_REDIST%redist\\intel64\\compiler',
    'C:\\Tools\\',
    ''
  ])
  assert.equal(joinWindowsPathEntries(entries), rawPath)

  const uncPath = '\\\\server\\share\\bin;;\\\\server\\share\\tools\\'
  const uncEntries = splitWindowsPathEntries(uncPath)
  assert.deepEqual(uncEntries, ['\\\\server\\share\\bin', '', '\\\\server\\share\\tools\\'])
  assert.equal(joinWindowsPathEntries(uncEntries), uncPath)

  const currentEntries = [
    '',
    'relative\\tool',
    'C:\\Tools\\',
    '',
    '%CUSTOM_BIN%',
    'D:\\FlyEnv\\bin'
  ]
  const merged = mergeWindowsPathPriority(currentEntries, ['d:\\flyenv\\bin', 'C:\\Tools'])

  assert.deepEqual(merged, [
    'd:\\flyenv\\bin',
    'C:\\Tools',
    '',
    'relative\\tool',
    '',
    '%CUSTOM_BIN%'
  ])

  assert.equal(
    isFlyEnvManagedPathEntry('C:\\FlyEnv\\env\\apache\\bin', 'C:\\FlyEnv\\env\\apache'),
    true
  )
  assert.equal(
    isFlyEnvManagedPathEntry('C:\\Tools\\my-env\\apache', 'C:\\FlyEnv\\env\\apache'),
    false
  )
  assert.equal(
    isFlyEnvManagedPathEntry('C:\\FlyEnv\\env\\apache2\\bin', 'C:\\FlyEnv\\env\\apache'),
    false
  )

  assert.equal(isWindowsJunctionOrSymlink({ isSymbolicLink: () => true }, 'win32'), true)
  assert.equal(isWindowsJunctionOrSymlink({ isSymbolicLink: () => false }, 'win32'), false)
  assert.equal(isWindowsJunctionOrSymlink({ isSymbolicLink: () => true }, 'darwin'), false)

  const envDir = await mkdtemp(join(tmpdir(), 'flyenv-junction-test-'))
  const danglingRoot = join(envDir, 'apache')
  const targetRoot = join(envDir, 'apache-target')
  try {
    await mkdir(targetRoot)
    await mkdir(join(envDir, 'manual'))
    await symlink(targetRoot, danglingRoot, 'junction')
    await rm(targetRoot, { recursive: true, force: true })

    assert.equal(existsSync(danglingRoot), false)
    assert.deepEqual(await readFlyEnvJunctions(envDir, 'win32'), [
      { name: 'apache', root: danglingRoot, isJunction: true }
    ])
  } finally {
    await rm(envDir, { recursive: true, force: true })
  }

  const pythonRoot = 'C:\\FlyEnv\\env\\python'
  const preferredPythonPaths = buildFlyEnvPreferredPaths(
    [
      {
        name: 'python',
        root: pythonRoot,
        isJunction: true,
        resolvedRoot: 'C:\\FlyEnv\\python-3.13'
      },
      {
        name: 'stale',
        root: 'C:\\FlyEnv\\env\\stale',
        isJunction: true
      },
      {
        name: 'fallback',
        root: 'D:\\Tools\\fallback',
        isJunction: false
      }
    ],
    (path) =>
      [
        'C:\\FlyEnv\\env\\python\\bin',
        'C:\\FlyEnv\\env\\python\\sbin',
        'C:\\FlyEnv\\env\\python\\python.exe',
        'C:\\FlyEnv\\env\\python\\Scripts\\pip.exe'
      ].includes(path)
  )
  assert.deepEqual(preferredPythonPaths, [
    'C:\\FlyEnv\\env\\python\\bin',
    'C:\\FlyEnv\\env\\python\\sbin',
    'C:\\FlyEnv\\env\\python\\Scripts',
    pythonRoot,
    'D:\\Tools\\fallback'
  ])
  assert.throws(
    () => selectFlyEnvPreferredRoots([], 'apache', 'C:\\FlyEnv\\apache', true),
    /junction "apache" is missing/
  )
  assert.deepEqual(selectFlyEnvPreferredRoots([], 'apache', 'C:\\FlyEnv\\apache', false), [
    { name: 'apache', root: 'C:\\FlyEnv\\apache', isJunction: false }
  ])

  assert.equal(
    selectComposerVendorBinEntry([
      ['%COMPOSER_HOME%\\vendor\\bin', 'C:\\Users\\flyenv\\composer\\vendor\\bin'],
      [
        '%APPDATA%\\Composer\\vendor\\bin',
        'C:\\Users\\flyenv\\AppData\\Roaming\\Composer\\vendor\\bin'
      ]
    ]),
    '%COMPOSER_HOME%\\vendor\\bin'
  )
  assert.equal(
    selectComposerVendorBinEntry([
      ['%COMPOSER_HOME%\\vendor\\bin', '%COMPOSER_HOME%\\vendor\\bin'],
      [
        '%APPDATA%\\Composer\\vendor\\bin',
        'C:\\Users\\flyenv\\AppData\\Roaming\\Composer\\vendor\\bin'
      ]
    ]),
    '%APPDATA%\\Composer\\vendor\\bin'
  )
  assert.deepEqual(
    mergeWindowsPathPriority(
      ['C:\\SDK\\bin', '%COMPOSER_HOME%\\vendor\\bin', '%APPDATA%\\Composer\\vendor\\bin'],
      ['%COMPOSER_HOME%\\vendor\\bin']
    ),
    ['%COMPOSER_HOME%\\vendor\\bin', 'C:\\SDK\\bin', '%APPDATA%\\Composer\\vendor\\bin']
  )

  assert.equal(isSystemPathChangedError(new Error('system_path_changed')), true)
  assert.equal(isSystemPathChangedError(new Error('failed to set system PATH')), false)

  console.log('windows path write test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
