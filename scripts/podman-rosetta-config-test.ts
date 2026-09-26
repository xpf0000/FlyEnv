import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  parsePodmanVersion,
  podmanSupportsRosetta,
  podmanRosettaVersionTooOld,
  PODMAN_ROSETTA_MIN_VERSION
} from '../src/shared/podman-rosetta'

const source = readFileSync(join(process.cwd(), 'src/fork/module/Podman/index.ts'), 'utf-8')

assert.match(
  source,
  /const env = await EnvSync\.sync\(\)[\s\S]*?env\.XDG_CONFIG_HOME \|\| join\(homedir\(\), '\.config'\)/,
  "Rosetta config must use the XDG_CONFIG_HOME from Podman's synchronized shell environment"
)

assert.match(
  source,
  /env\.CONTAINERS_CONF && !env\.CONTAINERS_CONF_OVERRIDE[\s\S]*?CONTAINERS_CONF_OVERRIDE: rosettaConfig/,
  'Rosetta config must be loaded after a custom CONTAINERS_CONF for machine initialization'
)

assert.match(
  source,
  /podmanSupportsRosetta\(version\)/,
  'Rosetta write must gate on shared podmanSupportsRosetta()'
)

assert.match(
  source,
  /PODMAN_ROSETTA_DROPIN/,
  'Rosetta drop-in must include the managed-file header comment'
)

const dropin = readFileSync(join(process.cwd(), 'src/shared/podman-rosetta.ts'), 'utf-8')
assert.doesNotMatch(dropin, /—/, 'drop-in header must stay ASCII-safe for containers.conf')
assert.match(dropin, /PODMAN_ROSETTA_DROPIN = `# Managed by FlyEnv/)

assert.equal(parsePodmanVersion('podman version 5.1.0'), '5.1.0')
assert.equal(parsePodmanVersion('5.1'), '5.1.0')
assert.equal(parsePodmanVersion('5.0.0'), '5.0.0')
assert.equal(parsePodmanVersion('bogus'), undefined)
assert.equal(podmanSupportsRosetta('5.0.9'), false)
assert.equal(podmanSupportsRosetta('5.1.0'), true)
assert.equal(podmanSupportsRosetta('podman version 5.2.1'), true)
assert.equal(podmanSupportsRosetta(''), false)
assert.equal(podmanRosettaVersionTooOld(''), false)
assert.equal(podmanRosettaVersionTooOld('5.0.9'), true)
assert.equal(podmanRosettaVersionTooOld('5.1.0'), false)
assert.equal(PODMAN_ROSETTA_MIN_VERSION, '5.1.0')

const vue = readFileSync(
  join(process.cwd(), 'src/render/components/Podman/machine/machineAdd.vue'),
  'utf-8'
)
assert.match(vue, /podmanRosettaVersionTooOld/)
assert.match(vue, /:disabled="rosettaVersionTooOld"/)

console.log('Podman Rosetta config path checks passed')
