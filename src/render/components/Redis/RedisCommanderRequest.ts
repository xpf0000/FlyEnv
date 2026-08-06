export type RedisCommanderOpenRequest = {
  node: { bin: string }
  redis: { version: string | null }
}

export function redisCommanderRequest(
  node: { bin: string },
  redis: { version: string | null }
): RedisCommanderOpenRequest {
  return {
    node: { bin: node.bin },
    redis: { version: redis.version }
  }
}
