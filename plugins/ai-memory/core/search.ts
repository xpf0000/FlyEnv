import { createHash } from 'node:crypto'
import { MemoryFault, validateInput } from './validation'
import { INPUT_LIMITS, utf8Bytes } from './limits'
import type { SearchHit, SearchInput } from '../shared'

const normalize = (value: string) => value.normalize('NFKC').toLowerCase()
const stopWords = new Set([
  'a',
  'an',
  'the',
  'is',
  'are',
  'was',
  'were',
  'to',
  'of',
  'in',
  'on',
  'for',
  'and',
  'or',
  'we',
  'our',
  'i',
  'it',
  'what',
  'how',
  'why',
  'did',
  'do',
  'does',
  'which',
  'when',
  'with',
  'should'
])
function terms(value: string): string[] {
  const tokens =
    normalize(value).match(/[\p{Script=Han}]+|[\p{L}\p{N}]+(?:[-_./#:+][\p{L}\p{N}]+)*/gu) ?? []
  return [
    ...new Set(
      tokens.flatMap((token) => {
        if (/^\p{Script=Han}+$/u.test(token) && token.length > 2) {
          return [
            token,
            ...Array.from({ length: token.length - 1 }, (_, i) => token.slice(i, i + 2))
          ]
        }
        return stopWords.has(token) ? [] : [token]
      })
    )
  ]
}
function matches(field: string, term: string): boolean {
  if (/\p{Script=Han}/u.test(term)) return normalize(field).includes(term)
  return terms(field).includes(term)
}
export function rankMetadata(
  records: readonly SearchHit[],
  input: SearchInput,
  now = Date.now()
): SearchHit[] {
  const queryTerms = [...new Set((input.queries ?? []).flatMap(terms))]
  const hasQuery = (input.queries ?? []).some((q) => q.trim())
  return records
    .flatMap((record) => {
      if (input.scope === 'global' && record.scope !== 'global') return []
      if (input.scope === 'project' && record.scope === 'global' && !input.include_global) return []
      if (
        record.status !== (input.status ?? 'active') ||
        (input.type && input.type !== record.type)
      )
        return []
      if (input.topic && normalize(input.topic) !== normalize(record.topic)) return []
      if (input.tags?.some((tag) => !record.tags.map(normalize).includes(normalize(tag)))) return []
      const expired = !!record.expires_at && Date.parse(record.expires_at) <= now
      if (expired && !input.include_expired) return []
      let score = 0
      let covered = 0
      for (const term of queryTerms) {
        const weight = Math.max(
          matches(record.title, term) ? 8 : 0,
          matches(record.topic, term) ? 8 : 0,
          record.tags.some((tag) => matches(tag, term)) ? 8 : 0,
          matches(record.summary, term) ? 1 : 0
        )
        if (weight) covered++
        score += weight
      }
      if (hasQuery && !covered) return []
      // Pinned affects browsing only; it cannot manufacture a query match.
      score += hasQuery ? covered * 2 : record.pinned ? 1 : 0
      return [{ record: { ...record, ...(expired ? { expired: true } : {}) }, score }]
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.record.updated_at.localeCompare(a.record.updated_at) ||
        a.record.id.localeCompare(b.record.id)
    )
    .map((item) => item.record)
}

export type SearchSnapshot = {
  scopeKey: string
  generation: string
  records: readonly SearchHit[]
  warnings: readonly import('../shared').MemoryWarning[]
}

/** A cursor binds filters and every independent scope snapshot, not a network transaction. */
export function searchPage(
  snapshots: readonly SearchSnapshot[],
  raw: SearchInput,
  responseBytes = INPUT_LIMITS.responseBytes as number,
  extra: Pick<import('../shared').SearchPage, 'unregistered' | 'project_candidates'> = {}
): import('../shared').MemoryResult<import('../shared').SearchPage> {
  const input = validateInput('search', raw)
  const limit = input.limit!
  if (!Number.isSafeInteger(responseBytes) || responseBytes < 1)
    throw new MemoryFault('response_budget_exceeded')
  const budget = Math.min(responseBytes, INPUT_LIMITS.maxResponseBytes)
  const {
    cursor,
    project_path: _path,
    ...filters
  } = input as SearchInput & { project_path?: string }
  const fingerprint = createHash('sha256').update(JSON.stringify(filters)).digest('hex')
  const scopes = snapshots
    .map((snapshot) => [snapshot.scopeKey, snapshot.generation])
    .sort((a, b) => a[0].localeCompare(b[0]))
  let offset = 0
  let asOf = Date.now()
  if (cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
      if (
        decoded.v !== 1 ||
        decoded.fingerprint !== fingerprint ||
        JSON.stringify(decoded.scopes) !== JSON.stringify(scopes) ||
        !Number.isSafeInteger(decoded.offset) ||
        decoded.offset < 0 ||
        !Number.isSafeInteger(decoded.asOf) ||
        decoded.asOf < 0 ||
        decoded.asOf > Date.now()
      )
        throw new Error()
      offset = decoded.offset
      asOf = decoded.asOf
    } catch {
      throw new MemoryFault('cursor_invalid')
    }
  }
  const ranked = rankMetadata(
    snapshots.flatMap((snapshot) => [...snapshot.records]),
    input,
    asOf
  )
  if (offset > ranked.length) throw new MemoryFault('cursor_invalid')
  const allWarnings = snapshots.flatMap((snapshot) => [...snapshot.warnings])
  const partial = allWarnings.length > 0
  const warnings = allWarnings.slice(0, 100)
  let warningsTruncated = allWarnings.length > warnings.length
  const selected = ranked.slice(offset, offset + limit)
  const response = (): import('../shared').MemoryResult<import('../shared').SearchPage> => {
    const next = offset + selected.length
    return {
      outcome: partial ? 'partial' : 'success',
      data: {
        ...extra,
        results: [...selected],
        truncated: next < ranked.length,
        ...(next < ranked.length
          ? {
              next_cursor: Buffer.from(
                JSON.stringify({ v: 1, fingerprint, scopes, offset: next, asOf })
              ).toString('base64url')
            }
          : {})
      },
      ...(partial
        ? {
            warnings: [...warnings, ...(warningsTruncated ? [{ code: 'warnings_truncated' }] : [])]
          }
        : {})
    }
  }
  let result = response()
  while (utf8Bytes(JSON.stringify(result)) > budget && warnings.length) {
    warnings.pop()
    warningsTruncated = true
    result = response()
  }
  while (utf8Bytes(JSON.stringify(result)) > budget && selected.length) {
    selected.pop()
    result = response()
  }
  if (utf8Bytes(JSON.stringify(result)) > budget || (!selected.length && offset < ranked.length))
    throw new MemoryFault('response_budget_exceeded')
  return result
}
