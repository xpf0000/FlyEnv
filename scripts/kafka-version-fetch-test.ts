import assert from 'node:assert/strict'
import KafkaOnlineVersionFetch from '../plugins/kafka/fork/Kafka/version'
import { compareVersions } from '../src/shared/compare-versions'

const check = (name: string, list: any[]) => {
  assert.ok(list.length > 0, `${name}: list should not be empty`)
  for (const item of list) {
    assert.ok(item.url, `${name}: item missing url: ${JSON.stringify(item)}`)
    assert.ok(item.version, `${name}: item missing version: ${JSON.stringify(item)}`)
    assert.ok(item.mVersion, `${name}: item missing mVersion: ${JSON.stringify(item)}`)
    assert.ok(
      compareVersions(item.versionSort, '3.5.0') >= 0,
      `${name}: version ${item.version} below minVersion 3.5.0`
    )
  }
  assert.ok(
    list.some((item) => item.version.startsWith('4.')),
    `${name}: expected at least one 4.x entry`
  )
}

const run = async () => {
  const win = await KafkaOnlineVersionFetch.win()
  const macX86 = await KafkaOnlineVersionFetch.mac('x86')
  const macArm = await KafkaOnlineVersionFetch.mac('arm')
  const linuxX86 = await KafkaOnlineVersionFetch.linux('x86')
  const linuxArm = await KafkaOnlineVersionFetch.linux('arm')

  check('win', win)
  check('mac-x86', macX86)
  check('mac-arm', macArm)
  check('linux-x86', linuxX86)
  check('linux-arm', linuxArm)

  console.log(`version count: ${win.length}`)
  console.log('first 5 entries:')
  for (const item of win.slice(0, 5)) {
    console.log(`  ${item.version} (mVersion ${item.mVersion}) -> ${item.url}`)
  }
  console.log('kafka-version-fetch-test: all assertions passed')
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
