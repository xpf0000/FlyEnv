import { getSetting, settingFields, knownTemplateThinkingKeys } from './launchOptions'
import type { RuntimeCapabilities } from './launchOptions'
import type { ModelProfile, ServiceSettings, ValidationIssue } from './settings'
import { tokenizeExtraArgs } from './extraArguments'
export const validateProfileInput = (p: ModelProfile): ValidationIssue[] => {
  const issues: ValidationIssue[] = []
  const bad = (field: string, message: string) =>
    issues.push({ code: 'invalid-value', field, severity: 'input', message })
  try {
    tokenizeExtraArgs(p.extraArgsText)
  } catch (e) {
    bad('extraArgsText', String(e))
  }
  for (const b of ['cpu', 'cuda', 'vulkan', 'metal'])
    for (const f of settingFields) {
      const v = getSetting(p, f.path, b)
      if (v === undefined || v === '') continue
      if (f.type === 'number' || (f.type === 'layers' && typeof v === 'number')) {
        if (
          typeof v !== 'number' ||
          !Number.isFinite(v) ||
          (f.integer && !Number.isInteger(v)) ||
          (f.min !== undefined && v < f.min) ||
          (f.max !== undefined && v > f.max)
        )
          bad(f.path, 'Invalid ' + f.en)
      }
      if (
        f.type === 'ratios' &&
        (!Array.isArray(v) || v.some((x) => !Number.isFinite(x) || x < 0) || !v.some((x) => x > 0))
      )
        bad(f.path, 'GPU proportions must be non-negative with a positive total')
    }
  if (p.base.contextSize !== undefined && p.base.contextSize !== 0 && p.base.contextSize < 128)
    bad('base.contextSize', 'Context size must be zero or at least 128')
  if (
    p.base.batchSize !== undefined &&
    p.base.ubatchSize !== undefined &&
    p.base.ubatchSize > p.base.batchSize
  )
    bad('base.ubatchSize', 'Micro-batch cannot exceed batch size')
  if (
    p.multimodal.imageMinTokens !== undefined &&
    p.multimodal.imageMaxTokens !== undefined &&
    p.multimodal.imageMinTokens > p.multimodal.imageMaxTokens
  )
    bad('multimodal.imageMinTokens', 'Image minimum cannot exceed maximum')
  if (
    p.chat.templateKwargs !== undefined &&
    (p.chat.templateKwargs === null ||
      Array.isArray(p.chat.templateKwargs) ||
      typeof p.chat.templateKwargs !== 'object')
  )
    bad('chat.templateKwargs', 'Template parameters must be a JSON object')
  if (p.sampling.repeatPenalty === 0)
    bad('sampling.repeatPenalty', 'Repeat penalty must be greater than zero')
  if (p.chat.jinja === false && p.chat.template.kind === 'file')
    bad('chat.jinja', 'A custom template file requires Jinja')
  for (const key of knownTemplateThinkingKeys(p.chat.template)) {
    const v = p.chat.templateKwargs?.[key]
    if (
      typeof v === 'boolean' &&
      p.chat.reasoning &&
      p.chat.reasoning !== 'auto' &&
      v !== (p.chat.reasoning === 'on')
    )
      bad('chat.templateKwargs', 'Thinking mode conflicts with template parameters')
  }
  const spec = p.speculation
  if (spec.mode === 'draft' || spec.mode === 'mtp') {
    if (spec.maxTokens !== undefined && (!Number.isInteger(spec.maxTokens) || spec.maxTokens < 0))
      bad('speculation.maxTokens', 'Draft token count must be a non-negative integer')
    if (spec.minTokens !== undefined && (!Number.isInteger(spec.minTokens) || spec.minTokens < 0))
      bad('speculation.minTokens', 'Draft token count must be a non-negative integer')
    if (
      spec.minTokens !== undefined &&
      spec.maxTokens !== undefined &&
      spec.minTokens > spec.maxTokens
    )
      bad('speculation.minTokens', 'Draft minimum exceeds maximum')
  }
  if (
    spec.mode === 'draft' &&
    spec.threads !== undefined &&
    (!Number.isInteger(spec.threads) || spec.threads < 1 || spec.threads > 512)
  )
    bad('speculation.threads', 'Invalid draft thread count')
  if (
    spec.mode === 'ngram' &&
    spec.size !== undefined &&
    (!Number.isInteger(spec.size) || spec.size < 1)
  )
    bad('speculation.size', 'Ngram size must be a positive integer')
  return issues.filter(
    (v, i, a) => a.findIndex((x) => x.field === v.field && x.message === v.message) === i
  )
}
export const validateModelFields = (
  p: ModelProfile,
  _caps: RuntimeCapabilities,
  _backend: string
) => validateProfileInput(p)

export const validateServiceInput = (s: ServiceSettings): ValidationIssue[] => {
  const issues: ValidationIssue[] = []
  if (!Number.isInteger(s.port) || s.port < 1 || s.port > 65535)
    issues.push({
      code: 'invalid-value',
      field: 'service.port',
      severity: 'input',
      message: 'Port must be an integer from 1 to 65535'
    })
  let valid = s.host === 'localhost'
  if (/^\d+\.\d+\.\d+\.\d+$/.test(s.host))
    valid = s.host.split('.').every((x) => String(Number(x)) === x && Number(x) <= 255)
  else if (s.host.includes(':')) {
    try {
      valid = new URL(`http://[${s.host.replace(/^\[|\]$/g, '')}]:80`).hostname.length > 2
    } catch {
      valid = false
    }
  }
  if (!valid)
    issues.push({
      code: 'invalid-value',
      field: 'service.host',
      severity: 'input',
      message: 'Host must be localhost or an IPv4/IPv6 address'
    })
  return issues
}
