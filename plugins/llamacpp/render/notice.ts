const htmlEntities: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

export const escapeNoticeText = (error: unknown): string =>
  (error instanceof Error ? error.message : `${error}`).replace(
    /[&<>"']/g,
    (character) => htmlEntities[character]
  )
