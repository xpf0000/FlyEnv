import { controlledOptions, type RuntimeCapabilities } from './launchOptions'
export interface ArgumentToken {
  value: string
  start: number
  end: number
  quoted: boolean
}
export interface ParsedOption {
  flag: string
  canonicalName: string
  values: string[]
  negative: boolean
  source: 'form' | 'extra'
  start?: number
  end?: number
}
export const tokenizeExtraArgs = (text: string): ArgumentToken[] => {
  const result: ArgumentToken[] = []
  let value = '',
    start = -1,
    quote = '',
    quoted = false
  const finish = (end: number) => {
    if (start >= 0) {
      if (!quoted && /^(?:\||\|\||&&|;|>|>>|<|<<)$/.test(value))
        throw Error('Only startup arguments are accepted, not shell operators')
      result.push({ value, start, end, quoted })
      value = ''
      start = -1
      quoted = false
    }
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (start < 0 && /\s/.test(c)) continue
    if (start < 0) start = i
    if (quote) {
      if (c === quote) {
        quote = ''
        continue
      }
      if (c === '\\' && quote === '"' && text[i + 1] === '"') {
        value += '"'
        i++
        continue
      }
      value += c
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      quoted = true
      continue
    }
    if (/\s/.test(c)) {
      finish(i)
      continue
    }
    value += c
  }
  if (quote) throw Error('Unclosed quote at character ' + start)
  finish(text.length)
  return result
}
const names: Record<string, string> = {
  'gpu-layers': 'n-gpu-layers',
  'model-draft': 'spec-draft-model',
  'n-gpu-layers-draft': 'spec-draft-ngl',
  'gpu-layers-draft': 'spec-draft-ngl',
  'device-draft': 'spec-draft-device',
  'threads-draft': 'spec-draft-threads',
  'draft-max': 'spec-draft-n-max',
  'draft-min': 'spec-draft-n-min'
}
export const canonicalOption = (name: string) => names[name] ?? name
export const parseExtraArgs = (
  tokens: ArgumentToken[],
  caps: RuntimeCapabilities,
  source: 'form' | 'extra' = 'extra'
): ParsedOption[] => {
  const result: ParsedOption[] = []
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    const equal = token.value.indexOf('=')
    const flag = equal < 0 ? token.value : token.value.slice(0, equal)
    const cap = caps.byAlias[flag]
    if (!cap) throw Error('Unknown or unverifiable option: ' + flag)
    const values: string[] = []
    let end = token.end
    if (equal >= 0) {
      if (cap.arity === 0) throw Error('Option does not accept a value: ' + flag)
      values.push(token.value.slice(equal + 1))
      if (cap.arity === 2) {
        const next = tokens[++i]
        if (!next) throw Error('Missing value for ' + flag)
        values.push(next.value)
        end = next.end
      }
    } else if (cap.arity === 1 || cap.arity === 2) {
      for (let n = 0; n < cap.arity; n++) {
        const next = tokens[++i]
        if (!next) throw Error('Missing value for ' + flag)
        values.push(next.value)
        end = next.end
      }
    } else if (
      cap.arity === 'optional' &&
      tokens[i + 1] &&
      (tokens[i + 1].quoted || !tokens[i + 1].value.startsWith('-'))
    ) {
      const next = tokens[++i]
      values.push(next.value)
      end = next.end
    }
    if (cap.values && values.some((v) => !cap.values!.includes(v)))
      throw Error('Unsupported value for ' + flag)
    result.push({
      flag,
      canonicalName: canonicalOption(cap.canonicalName),
      values,
      negative: !!cap.negative,
      source,
      start: token.start,
      end
    })
  }
  return result
}
export const mergeLaunchOptions = (
  form: ParsedOption[],
  extra: ParsedOption[],
  caps: RuntimeCapabilities
): ParsedOption[] => {
  const seen = new Set(form.map((o) => o.canonicalName))
  if (
    seen.has('load-mode') &&
    extra.some((o) => ['mmap', 'mlock', 'direct-io'].includes(o.canonicalName))
  )
    throw Error('Duplicate model loading option source')
  for (const option of extra) {
    if (controlledOptions.has(option.canonicalName))
      throw Error('This option is managed by FlyEnv: ' + option.flag)
    const repeatable =
      [
        'lora',
        'lora-scaled',
        'control-vector',
        'control-vector-scaled',
        'override-kv',
        'override-tensor',
        'dry-sequence-breaker'
      ].includes(option.canonicalName) || caps.byAlias[option.flag]?.repeatable
    if (seen.has(option.canonicalName) && !repeatable)
      throw Error('Duplicate option source: ' + option.flag)
    seen.add(option.canonicalName)
  }
  return [...form, ...extra]
}
export const buildLaunchArguments = (options: ParsedOption[]) =>
  options.flatMap((o) => [o.flag, ...o.values])
export const formatInvocation = (
  { bin, args, cwd }: { bin: string; args: string[]; cwd?: string },
  platform: 'win32' | 'posix'
): string => {
  const quote = (s: string) =>
    platform === 'win32'
      ? "'" + s.replace(/'/g, "''") + "'"
      : "'" + s.replace(/'/g, "'\"'\"'") + "'"
  const command = (platform === 'win32' ? '& ' : '') + [bin, ...args].map(quote).join(' ')
  return cwd
    ? (platform === 'win32'
        ? 'Set-Location -LiteralPath ' + quote(cwd) + '; '
        : 'cd ' + quote(cwd) + ' && ') + command
    : command
}
