import assert from 'node:assert/strict'
import { ForkPromise } from '../src/shared/ForkPromise'

async function main() {
  const result = await Promise.race([
    new ForkPromise(async () => {
      throw new Error('boom')
    }).then(
      () => 'resolved',
      (error) => `rejected:${error instanceof Error ? error.message : String(error)}`
    ),
    new Promise<string>((resolve) => setTimeout(() => resolve('timeout'), 200))
  ])

  assert.equal(result, 'rejected:boom')
  console.log('fork promise async rejection test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
