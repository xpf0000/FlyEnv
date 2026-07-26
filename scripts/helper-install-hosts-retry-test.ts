import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const helperStoreSource = readFileSync(join(root, 'src/render/store/helper.ts'), 'utf8')
const hostUtilSource = readFileSync(join(root, 'src/render/util/Host.ts'), 'utf8')
const forkHostSource = readFileSync(join(root, 'src/fork/module/Host/index.ts'), 'utf8')
const globalIpcSource = readFileSync(join(root, 'src/render/util/GlobalIPCOn.ts'), 'utf8')
const helperFixSource = readFileSync(
  join(root, 'src/render/components/Setup/FlyEnvHelper/setup.ts'),
  'utf8'
)
const manualInstallerSource = readFileSync(
  join(root, 'src/render/components/FlyEnvHelper/index.vue'),
  'utf8'
)

assert.match(helperStoreSource, /import \{ handleWriteHosts \} from '@\/util\/Host'/)

const verifyHelperReady = helperStoreSource.match(
  /verifyHelperReady\(\) \{(?<body>[\s\S]*?)\n[ ]{2}\}\n\n[ ]{2}private handleInstallResult/
)
assert.ok(verifyHelperReady?.groups?.body, 'verifyHelperReady must exist')
assert.match(
  verifyHelperReady.groups.body,
  /if \(res\?\.code === 0\) \{\s*handleWriteHosts\(\)\s*\.catch\(\(\) => \{\}\)/
)

const installResult = helperStoreSource.match(
  /private handleInstallResult\(res: any\) \{(?<body>[\s\S]*?)\n[ ]{2}\}\n\n[ ]{2}showNeedInstallDialog/
)
assert.ok(installResult?.groups?.body, 'handleInstallResult must exist')
assert.match(
  installResult.groups.body,
  /if \(res\?\.code !== 0\)[\s\S]*?return[\s\S]*?handleWriteHosts\(\)\s*\.catch\(\(\) => \{\}\)/
)

assert.doesNotMatch(
  helperStoreSource,
  /retryPendingSystemHostsWrite|systemHostsWritePending|markHelperReady|helperReadyHandling/
)
assert.doesNotMatch(hostUtilSource, /retryPendingSystemHostsWrite|systemHostsWritePending/)
assert.doesNotMatch(forkHostSource, /systemHostsFailed|systemHostsError|markSystemHostsFailed/)
assert.doesNotMatch(globalIpcSource, /markHelperReady/)
assert.doesNotMatch(helperFixSource, /HelperStore/)
assert.match(manualInstallerSource, /import HelperStore from '@\/store\/helper'/)
assert.match(manualInstallerSource, /HelperStore\.verifyHelperReady\(\)/)

console.log('helper-install-hosts-retry-test: ok')
