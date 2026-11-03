import type { ScopeBudgets } from '../shared'

export const INPUT_LIMITS = {
  title: 120,
  summary: 600,
  tags: 12,
  tag: 64,
  topic: 160,
  bodyBytes: 16 * 1024,
  agent: 120,
  description: 600,
  uri: 2048,
  session: 128,
  reason: 600,
  queries: 8,
  query: 240,
  path: 8192,
  cursor: 4096,
  searchLimit: 20,
  responseBytes: 8 * 1024,
  maxResponseBytes: 32 * 1024
} as const

// Bounded experiment values, not release defaults. Task 9 measures history/I/O/memory first.
export const EXPERIMENT_BUDGETS: ScopeBudgets = {
  recordBytes: 256 * 1024,
  scopeReadBytes: 8 * 1024 * 1024,
  cacheBytes: 4 * 1024 * 1024,
  readConcurrency: 4,
  responseBytes: INPUT_LIMITS.responseBytes
}
export const utf8Bytes = (value: string): number => new TextEncoder().encode(value).byteLength
