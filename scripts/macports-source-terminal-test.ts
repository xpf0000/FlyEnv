import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  sourceApplyCommand,
  sourceApplyOutcomes
} from '../src/render/components/Setup/MacPortsSrc/TerminalApply'

const directory = await mkdtemp(join(tmpdir(), "flyenv-macports-source-'"))
try {
  const files = ['a', 'b'].map((name) => ({
    path: join(directory, name + '.conf'),
    snapshot: join(directory, name + '.preview'),
    content: name + ' new config'
  }))
  const resultFile = join(directory, 'result.txt')
  for (const file of files) await writeFile(file.snapshot, file.content)
  for (const failed of ['', 'a', 'b']) {
    for (const file of files) await writeFile(file.path, 'original')
    const script = `sudo() {
      local destination="${'${@: -1}'}"
      if [ '${failed}' != '' ] && [[ "$destination" == */'${failed}.conf' ]]; then echo 'fixture denied' >&2; return 3; fi
      command cp "${'${@: -2:1}'}" "$destination"
    }
${sourceApplyCommand(files, resultFile)}`
    const result = spawnSync('/bin/bash', ['-c', script], { encoding: 'utf8' })
    assert.equal(result.status, failed ? 1 : 0)
    const outcomes = sourceApplyOutcomes(files, await readFile(resultFile, 'utf8'))
    assert.deepEqual(
      outcomes.map((item) => item.status),
      files.map((file) =>
        failed && file.path.endsWith('/' + failed + '.conf') ? 'failed' : 'completed'
      )
    )
    for (const file of files)
      assert.equal(
        await readFile(file.path, 'utf8'),
        failed && file.path.endsWith('/' + failed + '.conf') ? 'original' : file.content
      )
  }
  assert.deepEqual(
    sourceApplyOutcomes(files, '0:completed\ngarbage\n').map((item) => item.status),
    ['completed', 'unknown']
  )
  console.log(
    'MacPorts terminal source changes: quoting, independent writes and retained partial/unknown outcomes passed'
  )
} finally {
  await rm(directory, { recursive: true, force: true })
}
