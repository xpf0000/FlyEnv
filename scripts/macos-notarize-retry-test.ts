import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { promisify } from 'node:util'
import { transformSync } from 'esbuild'

const source = readFileSync(new URL('../build/notarize.ts', import.meta.url), 'utf8')
const { code } = transformSync(source, { loader: 'ts', format: 'cjs', target: 'node22' })
const networkOutput =
  'Domain is api.apple-cloudkit.com\nError Domain=NSURLErrorDomain Code=-1005 "The network connection was lost."'
const stapleFailure = (output = networkOutput, code = 68) =>
  new Error(`Failed to staple your application with code: ${code}\n\n${output}`)

async function run(options: {
  notarizeError?: Error
  stapleErrors?: Array<Error | undefined>
  platform?: string
  credentials?: boolean
}) {
  const submissions: unknown[] = []
  const commands: Array<{ file: string; args: string[]; options: Record<string, unknown> }> = []
  const delays: number[] = []
  const warnings: string[] = []
  const env =
    options.credentials === false
      ? {}
      : {
          APPLE_API_ISSUER: 'issuer',
          APPLE_API_KEY_ID: 'key-id',
          APPLE_API_KEY_PATH: '/key.p8'
        }
  const module = { exports: {} as { default: (context: unknown) => Promise<void> } }
  const dependencies: Record<string, unknown> = {
    'node:util': { promisify },
    '@electron/notarize': {
      notarize: async (params: unknown) => {
        submissions.push(params)
        if (options.notarizeError) throw options.notarizeError
      }
    },
    'node:child_process': {
      execFile: (
        file: string,
        args: string[],
        settings: Record<string, unknown>,
        callback: (...args: unknown[]) => void
      ) => {
        const index = commands.length
        commands.push({ file, args, options: settings })
        const error = options.stapleErrors?.[index]
        callback(error ?? null, '', '')
      }
    },
    'node:timers/promises': {
      setTimeout: async (delay: number) => {
        delays.push(delay)
      }
    }
  }
  runInNewContext(code, {
    module,
    exports: module.exports,
    Error,
    process: { env },
    console: { warn: (message: string) => warnings.push(message), log: () => {} },
    require: (name: string) => {
      if (name in dependencies) return dependencies[name]
      throw new Error(`Unexpected dependency: ${name}`)
    }
  })
  let error: unknown
  try {
    await module.exports.default({
      electronPlatformName: options.platform ?? 'darwin',
      appOutDir: '/release dir/mac',
      packager: { appInfo: { productFilename: 'FlyEnv' } }
    })
  } catch (caught) {
    error = caught
  }
  return { error, submissions, commands, delays, warnings }
}

const recovered = await run({ notarizeError: stapleFailure() })
assert.equal(
  recovered.error,
  undefined,
  'CloudKit disconnect after accepted notarization must recover'
)
assert.equal(recovered.submissions.length, 1, 'recovery must never resubmit notarization')
assert.equal(recovered.commands.length, 1)
assert.equal(recovered.commands[0].file, 'xcrun')
assert.deepEqual(Array.from(recovered.commands[0].args), [
  'stapler',
  'staple',
  '-v',
  '/release dir/mac/FlyEnv.app'
])
assert.ok(Number(recovered.commands[0].options.timeout) > 0, 'each network command needs a timeout')
assert.ok(recovered.delays[0] > 0, 'allow time for the network to recover')

const transientCommandError = () =>
  Object.assign(new Error('stapler failed'), {
    code: 68,
    stdout: networkOutput
  })
const eventual = await run({
  notarizeError: stapleFailure(),
  stapleErrors: [transientCommandError()]
})
assert.equal(eventual.error, undefined)
assert.equal(eventual.commands.length, 2)
assert.ok(eventual.delays[1] > eventual.delays[0], 'retries should back off')

const timedOut = await run({
  notarizeError: stapleFailure(networkOutput.replace('Code=-1005', 'Code=-1001'))
})
assert.equal(timedOut.error, undefined, 'CloudKit network timeouts can also recover')
assert.equal(timedOut.commands.length, 1)

const failures = Array.from({ length: 10 }, transientCommandError)
const exhausted = await run({ notarizeError: stapleFailure(), stapleErrors: failures })
assert.equal(exhausted.commands.length, 3, 'retry budget must be bounded')
assert.equal(
  exhausted.error,
  failures[2],
  'exhausted recovery must fail the build with the last error'
)
assert.equal(exhausted.submissions.length, 1)

for (const error of [
  new Error('Failed to notarize via notarytool: Invalid'),
  stapleFailure('Certificate trust evaluation failed'),
  stapleFailure(networkOutput, 65),
  new Error(networkOutput)
]) {
  const result = await run({ notarizeError: error })
  assert.equal(result.error, error, 'unrelated failures must propagate unchanged')
  assert.equal(result.commands.length, 0)
  assert.equal(result.delays.length, 0)
}

const permanentError = Object.assign(new Error('invalid app'), { code: 65 })
const permanent = await run({ notarizeError: stapleFailure(), stapleErrors: [permanentError] })
assert.equal(permanent.error, permanentError)
assert.equal(permanent.commands.length, 1, 'permanent failures must stop recovery immediately')

const trustError = Object.assign(new Error('certificate trust failed'), {
  code: 68,
  stdout: 'Domain is api.apple-cloudkit.com\nCertificate trust evaluation failed'
})
const untrusted = await run({ notarizeError: stapleFailure(), stapleErrors: [trustError] })
assert.equal(untrusted.error, trustError)
assert.equal(
  untrusted.commands.length,
  1,
  'code 68 alone must not make certificate errors retryable'
)

const commandTimeout = Object.assign(new Error('stapler timed out'), {
  killed: true,
  signal: 'SIGTERM'
})
const hung = await run({ notarizeError: stapleFailure(), stapleErrors: [commandTimeout] })
assert.equal(hung.error, commandTimeout)
assert.equal(hung.commands.length, 1, 'a killed command must not be reported as successful')

const success = await run({})
assert.equal(success.error, undefined)
assert.equal(success.submissions.length, 1)
assert.equal(success.commands.length, 0)
assert.equal(success.delays.length, 0)
for (const options of [{ platform: 'win32' }, { credentials: false }]) {
  const skipped = await run(options)
  assert.equal(skipped.error, undefined)
  assert.equal(skipped.submissions.length, 0)
  assert.equal(skipped.commands.length, 0)
}

console.log('macOS notarization stapling recovery checks passed')
