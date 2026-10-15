import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MSSQL_WINDOWS_INSTALLERS,
  debDownloadUrl,
  isScAccessDenied,
  isStrongSaPassword,
  mssqlMajorOfVersion,
  parseOsRelease,
  parsePackagesIndex,
  parseRegInstanceNames,
  parseRegInstanceSetup,
  parseScQueryEx,
  ubuntuMssqlRepoCandidates,
  windowsInstanceFromSetup,
  windowsServiceName
} from '../plugins/mssql/fork/Mssql/version'

const testPackagesIndexParsing = () => {
  const fixture = [
    'Package: mssql-server',
    'Version: 16.0.4305.5-1',
    'Architecture: amd64',
    'Description: Microsoft SQL Server Relational Database Engine',
    ' The mssql-server package contains the engine.',
    'SHA256: 3fbd4e3d2ad41e9abf9195b22a2dd213632ce4eeac6da3f806bc9d8f7369385a',
    'Size: 290332670',
    'Filename: pool/main/m/mssql-server/mssql-server_16.0.4305.5-1_amd64.deb',
    '',
    'Package: mssql-server-sqliosim',
    'Version: 16.0.4195.2-4',
    'Filename: pool/main/m/mssql-server-sqliosim/mssql-server-sqliosim_16.0.4195.2-4_amd64.deb',
    'Size: 1000',
    '',
    'Package: broken-entry-without-version',
    'Filename: pool/main/x/x.deb',
    ''
  ].join('\n')
  const entries = parsePackagesIndex(fixture)
  assert.equal(entries.length, 2, 'broken stanza without Version must be skipped')
  const server = entries.find((e) => e.packageName === 'mssql-server')!
  assert.equal(server.version, '16.0.4305.5-1')
  assert.equal(server.filename, 'pool/main/m/mssql-server/mssql-server_16.0.4305.5-1_amd64.deb')
  assert.equal(server.size, 290332670)
  assert.equal(server.sha256, '3fbd4e3d2ad41e9abf9195b22a2dd213632ce4eeac6da3f806bc9d8f7369385a')
  assert.equal(server.description, 'Microsoft SQL Server Relational Database Engine')
  assert.equal(
    debDownloadUrl(
      'https://packages.microsoft.com/ubuntu/22.04/mssql-server-2022',
      server.filename
    ),
    'https://packages.microsoft.com/ubuntu/22.04/mssql-server-2022/pool/main/m/mssql-server/mssql-server_16.0.4305.5-1_amd64.deb'
  )
}

const testOsReleaseParsing = () => {
  const ubuntu = parseOsRelease(
    ['NAME="Ubuntu"', 'VERSION_ID="24.04"', 'ID=ubuntu', '# comment', 'ID_LIKE=debian'].join('\n')
  )
  assert.deepEqual(ubuntu, { id: 'ubuntu', versionId: '24.04' })
  const fedora = parseOsRelease('ID=fedora\nVERSION_ID="40"\n')
  assert.deepEqual(fedora, { id: 'fedora', versionId: '40' })
}

const testRepoMapping = () => {
  const jammy = ubuntuMssqlRepoCandidates({ id: 'ubuntu', versionId: '22.04' })
  assert.deepEqual(
    jammy.map((r) => r.packagesUrl),
    [
      'https://packages.microsoft.com/ubuntu/22.04/mssql-server-2025/dists/jammy/main/binary-amd64/Packages.gz',
      'https://packages.microsoft.com/ubuntu/22.04/mssql-server-2022/dists/jammy/main/binary-amd64/Packages.gz'
    ]
  )
  assert.deepEqual(
    ubuntuMssqlRepoCandidates({ id: 'ubuntu', versionId: '24.04' }).map((r) => r.codename),
    ['noble', 'noble']
  )
  assert.deepEqual(ubuntuMssqlRepoCandidates({ id: 'ubuntu', versionId: '20.04' }), [])
  assert.deepEqual(ubuntuMssqlRepoCandidates({ id: 'debian', versionId: '12' }), [])
  assert.deepEqual(ubuntuMssqlRepoCandidates({ id: 'fedora', versionId: '40' }), [])
}

const testRegInstanceNamesParsing = () => {
  const stdout = [
    '',
    'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Microsoft SQL Server\\Instance Names\\SQL',
    '    MSSQLSERVER    REG_SZ    MSSQL16.MSSQLSERVER',
    '    SQLEXPRESS    REG_SZ    MSSQL16.SQLEXPRESS',
    '    BROKENLINEWITHOUTVALUE',
    ''
  ].join('\r\n')
  const instances = parseRegInstanceNames(stdout)
  assert.deepEqual(instances, [
    { name: 'MSSQLSERVER', instanceId: 'MSSQL16.MSSQLSERVER' },
    { name: 'SQLEXPRESS', instanceId: 'MSSQL16.SQLEXPRESS' }
  ])
}

const testRegSetupParsingAndSkip = () => {
  const good = parseRegInstanceSetup(
    [
      'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Microsoft SQL Server\\MSSQL16.SQLEXPRESS\\Setup',
      '    Edition    REG_SZ    Express Edition',
      '    Version    REG_SZ    16.0.1000.6',
      '    SQLBinRoot    REG_SZ    C:\\Program Files\\Microsoft SQL Server\\MSSQL16.SQLEXPRESS\\MSSQL\\Binn\\',
      '    SQLDataRoot    REG_SZ    C:\\Program Files\\Microsoft SQL Server\\MSSQL16.SQLEXPRESS\\MSSQL\\DATA\\'
    ].join('\r\n')
  )
  assert.equal(good.version, '16.0.1000.6')
  assert.equal(good.edition, 'Express Edition')

  const exists = new Set([
    'C:\\Program Files\\Microsoft SQL Server\\MSSQL16.SQLEXPRESS\\MSSQL\\Binn\\sqlservr.exe'
  ])
  const scanned = windowsInstanceFromSetup(
    { name: 'SQLEXPRESS', instanceId: 'MSSQL16.SQLEXPRESS' },
    good,
    (bin) => exists.has(bin)
  )
  assert.ok(scanned)
  assert.equal(scanned!.serviceName, 'MSSQL$SQLEXPRESS')
  assert.equal(
    scanned!.bin,
    'C:\\Program Files\\Microsoft SQL Server\\MSSQL16.SQLEXPRESS\\MSSQL\\Binn\\sqlservr.exe'
  )

  // Broken instance (no Version value, or sqlservr.exe missing) returns null:
  // the caller skips it and keeps scanning the remaining instances.
  const broken = parseRegInstanceSetup(
    [
      'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Microsoft SQL Server\\MSSQL15.BROKEN\\Setup',
      '    Edition    REG_SZ    Express Edition'
    ].join('\r\n')
  )
  assert.equal(
    windowsInstanceFromSetup({ name: 'BROKEN', instanceId: 'MSSQL15.BROKEN' }, broken, () => true),
    null
  )
  assert.equal(
    windowsInstanceFromSetup(
      { name: 'SQLEXPRESS', instanceId: 'MSSQL16.SQLEXPRESS' },
      good,
      () => false
    ),
    null
  )
}

const testWindowsServiceName = () => {
  assert.equal(windowsServiceName('MSSQLSERVER'), 'MSSQLSERVER')
  assert.equal(windowsServiceName('SQLEXPRESS'), 'MSSQL$SQLEXPRESS')
  assert.equal(windowsServiceName('FLYENV'), 'MSSQL$FLYENV')
  assert.equal(windowsServiceName(''), '')
}

const testScQueryExParsing = () => {
  const running = parseScQueryEx(
    [
      '',
      'SERVICE_NAME: MSSQL$SQLEXPRESS',
      '        TYPE               : 10  WIN32_OWN_PROCESS',
      '        STATE              : 4  RUNNING',
      '                                (STOPPABLE, PAUSABLE, ACCEPTS_SHUTDOWN)',
      '        WIN32_EXIT_CODE    : 0  (0x0)',
      '        PID                : 7420',
      ''
    ].join('\r\n')
  )
  assert.deepEqual(running, { state: 'RUNNING', pid: 7420 })
  const stopped = parseScQueryEx(
    [
      'SERVICE_NAME: MSSQLSERVER',
      '        STATE              : 1  STOPPED',
      '        PID                : 0'
    ].join('\r\n')
  )
  assert.deepEqual(stopped, { state: 'STOPPED', pid: 0 })
}

const testAccessDeniedDetection = () => {
  assert.ok(isScAccessDenied('[SC] OpenService FAILED 5:\r\n\r\nAccess is denied.\r\n'))
  assert.ok(isScAccessDenied('拒绝访问。'))
  assert.ok(!isScAccessDenied('The service has not been started.'))
}

const testSaPasswordRule = () => {
  assert.ok(isStrongSaPassword('Flyenv#2026'))
  assert.ok(isStrongSaPassword('abcdefG1'))
  assert.ok(!isStrongSaPassword('short'))
  assert.ok(!isStrongSaPassword('alllowercase'))
  assert.ok(!isStrongSaPassword('ALLUPPER123'))
  assert.ok(!isStrongSaPassword(''))
}

const testMajorOfVersion = () => {
  assert.equal(mssqlMajorOfVersion('16.0.4305.5-1'), '16')
  assert.equal(mssqlMajorOfVersion('17.0.100.2-1'), '17')
  assert.equal(mssqlMajorOfVersion(''), '')
}

const testWindowsInstallerCatalog = () => {
  assert.equal(MSSQL_WINDOWS_INSTALLERS.length, 4)
  for (const item of MSSQL_WINDOWS_INSTALLERS) {
    assert.match(item.url, /^https:\/\/go\.microsoft\.com\/fwlink\//)
    assert.equal(item.installerKind, 'ssei-bootstrapper')
    assert.ok(item.fileName.endsWith('.exe'))
    assert.ok(item.licenseNote.length > 0)
  }
  assert.ok(
    MSSQL_WINDOWS_INSTALLERS.some((i) => i.edition === 'Developer'),
    'Developer edition must be listed with its license note'
  )
}

const testForkModuleContracts = () => {
  const source =
    readFileSync(join(import.meta.dirname, '../plugins/mssql/fork/Mssql/index.ts'), 'utf8') +
    readFileSync(join(import.meta.dirname, '../plugins/mssql/fork/Mssql/runtime.ts'), 'utf8')
  // EULA gate: installSoft must reject rows without explicit acceptance.
  assert.match(source, /request\?\.eulaAccepted !== true/)
  // versionDirCache must be cleared before scanning (plugin README contract).
  assert.match(source, /for \(const k in versionDirCache\)/)
  // Windows installer must never be launched with silent switches.
  assert.ok(!source.includes('/Q ') && !source.includes('/QS'), 'no silent install switches')
  // Linux startup must inject the documented environment.
  assert.match(source, /ACCEPT_EULA: 'Y'/)
  assert.match(source, /MSSQL_PID:/)
  assert.match(source, /MSSQL_TCP_PORT:/)
  assert.match(source, /MSSQL_SA_PASSWORD/)
  // Startup env carries the sa password; it must be redacted from diagnostics.
  assert.match(source, /sensitive: true/)
  // Windows service control goes through sc.exe, not process kills.
  assert.match(source, /sc\.exe \$\{action\}/)
}

testPackagesIndexParsing()
testOsReleaseParsing()
testRepoMapping()
testRegInstanceNamesParsing()
testRegSetupParsingAndSkip()
testWindowsServiceName()
testScQueryExParsing()
testAccessDeniedDetection()
testSaPasswordRule()
testMajorOfVersion()
testWindowsInstallerCatalog()
testForkModuleContracts()

console.log('mssql plugin contract tests passed')
