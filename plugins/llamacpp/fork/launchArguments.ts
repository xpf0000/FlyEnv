import type { RuntimeCapabilities } from '../shared/launchOptions'
export const addSupportedArgument = (
  args: string[],
  caps: RuntimeCapabilities,
  flag: string,
  value?: string
) => {
  const opt = caps.byAlias[flag]
  if (!opt) throw Error('This runtime does not support ' + flag)
  if (value !== undefined && opt.values && !opt.values.includes(value))
    throw Error('Unsupported value for ' + flag + ': ' + value)
  args.push(flag)
  if (value !== undefined) args.push(value)
}
export {
  tokenizeExtraArgs,
  parseExtraArgs,
  mergeLaunchOptions,
  buildLaunchArguments,
  formatInvocation
} from '../shared/extraArguments'

import { settingFields, getSetting } from '../shared/launchOptions'
import type { ModelProfile } from '../shared/settings'
export const appendSettingArguments = (
  args: string[],
  p: ModelProfile,
  backend: string,
  caps: RuntimeCapabilities,
  projectorActive: boolean
) => {
  for (const field of settingFields) {
    if (field.group === 'multimodal' && !projectorActive) continue
    if (
      backend === 'cpu' &&
      field.path.startsWith('backend.') &&
      field.path !== 'backend.gpuLayers'
    )
      continue
    let v = getSetting(p, field.path, backend)
    if (field.path === 'backend.gpuLayers' && backend === 'cpu') v = 0
    if (v === undefined || v === '') continue
    if (
      field.path === 'base.contextSize' &&
      v === 0 &&
      !/\b0\b/.test(caps.byAlias['--ctx-size']?.helpLine ?? '')
    )
      throw Error('This runtime cannot verify context size 0')
    if (
      field.type === 'layers' &&
      typeof v === 'string' &&
      !new RegExp('\\b' + v + '\\b').test(caps.byAlias[field.flag]?.helpLine ?? '')
    )
      throw Error('Unsupported GPU layer mode: ' + v)
    if (field.type === 'boolean') {
      addSupportedArgument(args, caps, v ? field.flag : field.negative!)
      continue
    }
    if (field.path === 'performance.flashAttention' && caps.byAlias[field.flag]?.arity === 0) {
      if (v !== 'on') throw Error('This runtime cannot represent Flash Attention ' + v)
      addSupportedArgument(args, caps, field.flag)
      continue
    }
    if (field.path === 'performance.loadMode' && !caps.byAlias[field.flag]) {
      if (v === 'mmap' || v === 'mlock') {
        addSupportedArgument(args, caps, '--' + v)
        continue
      }
      if (v === 'mmap+mlock') {
        addSupportedArgument(args, caps, '--mmap')
        addSupportedArgument(args, caps, '--mlock')
        continue
      }
      throw Error('Unsupported model load mode')
    }
    if (field.type === 'ratios') {
      const device = getSetting(p, 'backend.gpuDevice', backend)
      if (device && v.length !== String(device).split(',').length)
        throw Error('GPU ratio count must match selected devices')
    }
    addSupportedArgument(args, caps, field.flag, Array.isArray(v) ? v.join(',') : String(v))
  }
}
