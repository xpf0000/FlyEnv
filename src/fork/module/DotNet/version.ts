const VERSION_PATTERN = '\\d+(?:\\.\\d+){1,3}(?:[-+][^\\s]+)?'

export function getDotNetVersionFromInfoOutput(output: string): string {
  const text = output.replace(/\r\n/g, '\n')
  const match = text.match(
    new RegExp(`(?:^|\\n)\\s*Host:\\s*(?:\\n)+\\s*Version:\\s*(${VERSION_PATTERN})`, 'i')
  )
  return match?.[1]?.trim() ?? ''
}

export function getDotNetVersionFromOutput(output: string): string {
  const text = output.replace(/\r\n/g, '\n').trim()
  if (!text) {
    return ''
  }

  const directMatch = text.match(new RegExp(`^(${VERSION_PATTERN})$`))
  if (directMatch?.[1]) {
    return directMatch[1].trim()
  }

  return getDotNetVersionFromInfoOutput(text)
}
