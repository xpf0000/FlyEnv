import type { Server as HttpServer } from 'node:http'

export interface HttpServerCloseable {
  close: () => Promise<void> | void
}

export async function stopHttpServer(
  server?: HttpServer,
  closeables?: Iterable<HttpServerCloseable>
): Promise<void> {
  if (closeables) {
    await Promise.allSettled(
      Array.from(closeables, (item) => Promise.resolve().then(() => item.close()))
    )
  }

  if (!server) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
    server.closeAllConnections?.()
  })
}
