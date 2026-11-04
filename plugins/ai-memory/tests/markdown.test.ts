import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderMemoryMarkdown } from '../render/markdown'
test('memory Markdown treats raw HTML as text and never loads images or activates source links', () => {
  const html = renderMemoryMarkdown(
    '<img src="https://private.invalid/track">\n\n![tracking](https://private.invalid/pixel)\n\n[click](javascript:alert(1))\n\n[safe](https://private.invalid)\n\n**Text**'
  )
  assert.doesNotMatch(html, /<img|<script|<a[ >]/i)
  assert.match(html, /<strong>Text<\/strong>/)
  assert.match(html, /&lt;img/)
})
