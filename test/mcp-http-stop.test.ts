import assert from 'node:assert/strict'
import http, { type ServerResponse } from 'node:http'
import { stopHttpServer } from '../src/shared/httpServerStop'

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function main() {
  let activeResponse: ServerResponse | undefined
  const server = http.createServer((_req, res) => {
    activeResponse = res
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    })
    res.write('event: message\ndata: {"ok":true}\n\n')
  })

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('failed to resolve test server address')
  }

  const response = await fetch(`http://127.0.0.1:${address.port}`, {
    headers: {
      Accept: 'text/event-stream'
    }
  })
  assert.equal(response.status, 200)

  let closeableCalled = false
  const stopPromise = stopHttpServer(server, [
    {
      async close() {
        closeableCalled = true
      }
    }
  ])

  try {
    const outcome = await Promise.race([
      stopPromise.then(() => 'stopped'),
      delay(300).then(() => 'timeout')
    ])
    assert.equal(outcome, 'stopped')
    assert.equal(closeableCalled, true)
  } finally {
    activeResponse?.end()
    response.body?.cancel().catch(() => {})
    await stopPromise.catch(() => {})
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
