/** StorageTool prints a 128-bit Kafka UUID as unpadded URL-safe base64. Ignore JVM/log noise. */
export function kafkaClusterUuidFromOutput(stdout: string): string {
  return (
    stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^[A-Za-z0-9_-]{22}$/.test(line))
      .pop() ?? ''
  )
}

/** Java Properties.load(InputStream) reads Latin-1; keep generated non-ASCII paths unambiguous. */
export function kafkaPropertiesValue(value: string): string {
  return value.replace(
    /[^\x20-\x7e]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
  )
}
