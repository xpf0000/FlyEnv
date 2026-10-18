const gradients = [
  'linear-gradient(135deg, #8b9cf9 0%, #667eea 100%)',
  'linear-gradient(135deg, #fdab1f 0%, #f67b0c 100%)',
  'linear-gradient(135deg, #34c9a3 0%, #1e9e8a 100%)',
  'linear-gradient(135deg, #f78fb3 0%, #e15f8b 100%)'
]

export const folderInitial = (name: string): string =>
  (Array.from(name.trim())[0] ?? '?').toUpperCase()
export const folderGradient = (id: string): string => {
  let hash = 0
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return gradients[hash % gradients.length]
}
