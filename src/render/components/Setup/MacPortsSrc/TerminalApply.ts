export type SourceFile = { path: string; snapshot: string; content: string }
export type FileOutcome = { path: string; status: 'completed' | 'failed' | 'unknown' }
const quote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'"

/** Each config is an independent required write; preserve both outcomes on partial failure. */
export function sourceApplyCommand(files: SourceFile[], resultFile: string): string {
  const commands = [`: > ${quote(resultFile)} || exit 1`, 'flyenv_source_result=0']
  files.forEach((file, index) => {
    commands.push(`if sudo /usr/bin/install -o root -g wheel -m 644 ${quote(file.snapshot)} ${quote(file.path)}; then
  printf '%s\\n' '${index}:completed' >> ${quote(resultFile)}
else
  printf '%s\\n' '${index}:failed' >> ${quote(resultFile)}
  flyenv_source_result=1
fi`)
  })
  commands.push('(exit "$flyenv_source_result")')
  return commands.join('\n')
}

export function sourceApplyOutcomes(files: SourceFile[], text: string): FileOutcome[] {
  const results = new Map<string, string>()
  for (const line of text.trim().split('\n')) {
    const match = /^(\d+):(completed|failed)$/.exec(line)
    if (match) results.set(match[1], match[2])
  }
  return files.map((file, index) => {
    const status = results.get(String(index))
    return {
      path: file.path,
      status: status === 'completed' || status === 'failed' ? status : 'unknown'
    }
  })
}
