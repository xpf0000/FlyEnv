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
