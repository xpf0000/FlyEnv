import { isIP } from 'node:net'
import { isAbsolute, join, resolve } from 'node:path'
import type { SoftInstalled } from '@shared/app'
import type {
  LaunchInput,
  LaunchReport,
  ModelFileRef,
  ResolvedDependency
} from '../shared/settings'
import { clone, launchConfigKey } from '../shared/settings'
import type { RuntimeCapabilities } from '../shared/launchOptions'
import { modelFileKey, managedReference } from '../shared/modelFile'
import { readRuntimeCapabilities } from './capabilities'
import { resolveModelReference } from './modelReferences'
import { validateApiKeyFile, variantFromInstalled, resolveGpuDevice } from './config'
import {
  tokenizeExtraArgs,
  parseExtraArgs,
  mergeLaunchOptions,
  buildLaunchArguments,
  formatInvocation
} from '../shared/extraArguments'
import { validateProfileInput } from '../shared/validation'
import { appendSettingArguments, addSupportedArgument } from './launchArguments'
export interface PrepareDeps {
  environment?: () => Promise<Record<string, string>>
  modelsRoot: string
  capabilities?: (runtime: SoftInstalled) => Promise<RuntimeCapabilities>
  resolve?: (ref: ModelFileRef, role: ResolvedDependency['role']) => Promise<ResolvedDependency>
}
export const prepareLaunch = async (
  raw: LaunchInput,
  runtime: SoftInstalled,
  deps: PrepareDeps
): Promise<LaunchReport> => {
  const input = clone(raw),
    variant = variantFromInstalled(runtime),
    runtimeKey = JSON.stringify({ ...variant, bin: runtime.bin })
  const report: LaunchReport = { requestKey: launchConfigKey(input, runtimeKey), issues: [] }
  try {
    const { service: s, profile: p, model } = input
    const backend = variant.backend
    if (modelFileKey(model) !== p.modelKey)
      throw Error('Model profile does not match selected file')
    if (isIP(s.host) === 0 && s.host !== 'localhost')
      throw Error('Host must be localhost or an IP address')
    if (!Number.isInteger(s.port) || s.port < 1 || s.port > 65535)
      throw Error('Port must be between 1 and 65535')
    if (!['127.0.0.1', '::1', 'localhost'].includes(s.host) && !s.apiKeyFile)
      throw Error('API key file required for non-loopback binding')
    if (s.apiKeyFile) await validateApiKeyFile(s.apiKeyFile)
    const environment: Record<string, string> = await (
      deps.environment ?? (async () => (await import('@shared/EnvSync')).default.sync())
    )()
    const environmentSources: Record<string, string> = Object.fromEntries(
      Object.entries(environment).filter(
        ([k, v]) => /^(LLAMA_ARG_|MTMD_)/.test(k) && !!v && !/(?:KEY|TOKEN|SECRET|PASSWORD)/.test(k)
      )
    )
    const caps = await (deps.capabilities ?? readRuntimeCapabilities)(runtime)
    if (caps.status !== 'known') throw Error('Runtime options could not be verified')
    const extra = parseExtraArgs(tokenizeExtraArgs(p.extraArgsText), caps)
    const projectorActive =
      p.multimodal.mode === 'projector' ||
      extra.some((o) => o.canonicalName === 'mmproj' && !o.negative)
    if (projectorActive && extra.some((o) => /^--no-mmproj(?:-auto)?$/.test(o.flag)))
      throw Error('Projector configuration conflicts with disabling extra arguments')
    for (const [name, value] of Object.entries(environmentSources)) {
      if (
        projectorActive &&
        (/^LLAMA_ARG_NO_MMPROJ(?:_AUTO)?$/.test(name) ||
          (name === 'LLAMA_ARG_MMPROJ_AUTO' && /^(0|false|off|no)$/i.test(value)))
      )
        throw Error('Projector conflicts with inherited environment source: ' + name)
      if (/(?:HF_REPO|HF_FILE|MODEL_URL|MODEL_REPO|MODELS_DIR|MODELS_PRESET|ROUTER)/.test(name))
        throw Error('Conflicting inherited environment source: ' + name)
      const role: 'projector' | 'draft' | 'template' | undefined = /MMPROJ/.test(name)
        ? 'projector'
        : /(?:MODEL_DRAFT|SPEC_DRAFT_MODEL)/.test(name)
          ? 'draft'
          : /CHAT_TEMPLATE_FILE/.test(name)
            ? 'template'
            : undefined
      if (
        role &&
        value &&
        !extra.some(
          (o) =>
            o.canonicalName ===
            { projector: 'mmproj', draft: 'spec-draft-model', template: 'chat-template-file' }[role]
        ) &&
        !(role === 'projector' && p.multimodal.mode === 'projector') &&
        !(role === 'draft' && p.speculation.mode === 'draft') &&
        !(role === 'template' && p.chat.template.kind === 'file')
      )
        throw Error('Clear inherited file environment source before launching: ' + name)
    }
    if (Object.keys(environmentSources).length)
      report.issues.push({
        code: 'environment-source',
        severity: 'info',
        message:
          'Inherited runtime environment is shown separately; argv alone does not describe all inherited behavior.'
      })
    const resolve =
      deps.resolve ??
      ((ref, role) =>
        resolveModelReference(ref, role, { files: input.files, modelsRoot: deps.modelsRoot }))
    const dependencies: ResolvedDependency[] = []
    const main = await resolve(
      { kind: 'managed', fileKey: modelFileKey(model), fingerprint: p.fingerprint },
      'main'
    )
    dependencies.push(main)
    if (!main.fingerprint.sha256)
      report.issues.push({
        code: 'source-unverified',
        severity: 'unverified',
        message: 'Main file has no recorded SHA-256; source identity is unverified'
      })
    const args: string[] = []
    const add = (flag: string, value?: unknown) =>
      addSupportedArgument(args, caps, flag, value === undefined ? undefined : String(value))
    add('--model', main.path)
    add('--host', s.host)
    add('--port', s.port)
    if (s.apiKeyFile) add('--api-key-file', s.apiKeyFile)
    const fieldIssues = validateProfileInput(p)
    report.issues.push(...fieldIssues)
    if (fieldIssues.length) return report
    if (backend !== 'cpu') {
      const b = p.backendOverrides[backend]
      if (b?.gpuDevice) b.gpuDevice = resolveGpuDevice(backend, b.gpuDevice)
    }
    appendSettingArguments(args, p, backend, caps, projectorActive)
    if (p.multimodal.mode === 'projector') {
      if (!p.multimodal.projector) throw Error('Select a projector file')
      const dep = await resolve(p.multimodal.projector, 'projector')
      dependencies.push(dep)
      add('--mmproj', dep.path)
    }
    if (p.chat.template.kind === 'builtin') {
      if (!p.chat.template.name.trim()) throw Error('Enter a template name')
      add('--chat-template', p.chat.template.name)
    }
    if (p.chat.template.kind === 'file') {
      const dep = await resolve(p.chat.template.file, 'template')
      dependencies.push(dep)
      add('--chat-template-file', dep.path)
    }
    if (p.chat.templateKwargs !== undefined)
      add('--chat-template-kwargs', JSON.stringify(p.chat.templateKwargs))
    const speculation = p.speculation
    if (speculation.mode !== 'default') {
      const strategy = {
        none: 'none',
        draft: 'draft-simple',
        mtp: 'draft-mtp',
        ngram: 'ngram-simple'
      }[speculation.mode]
      add('--spec-type', strategy)
      if (speculation.mode === 'draft') {
        const dep = await resolve(speculation.file, 'draft')
        const mainTokenizer = main.description?.metadata?.['tokenizer.ggml.model'],
          draftTokenizer = dep.description?.metadata?.['tokenizer.ggml.model']
        if (mainTokenizer && draftTokenizer && mainTokenizer !== draftTokenizer)
          throw Error('Draft tokenizer type differs from the main model')
        dependencies.push(dep)
        add('--spec-draft-model', dep.path)
        if (speculation.threads !== undefined) add('--spec-draft-threads', speculation.threads)
        const b = p.backendOverrides[backend]
        if (backend !== 'cpu') {
          if (b?.draftGpuLayers !== undefined) add('--spec-draft-ngl', b.draftGpuLayers)
          if (b?.draftDevice) add('--spec-draft-device', b.draftDevice)
        }
        report.issues.push({
          code: 'draft-compatibility',
          severity: 'unverified',
          message: 'Draft tokenizer/model compatibility must be verified by the runtime'
        })
      }
      if (speculation.mode === 'draft' || speculation.mode === 'mtp') {
        if (speculation.maxTokens !== undefined) add('--spec-draft-n-max', speculation.maxTokens)
        if (speculation.minTokens !== undefined) add('--spec-draft-n-min', speculation.minTokens)
      }
      if (speculation.mode === 'mtp')
        report.issues.push({
          code: 'mtp-compatibility',
          severity: 'unverified',
          message:
            'MTP heads must be present in the main model; runtime loading will verify compatibility'
        })
      if (speculation.mode === 'ngram' && speculation.size !== undefined)
        add('--spec-ngram-simple-size-n', speculation.size)
    }
    if (
      p.multimodal.mode === 'text' &&
      extra.some((o) => o.canonicalName === 'mmproj' && !o.negative)
    )
      throw Error('Text-only mode conflicts with extra mmproj')
    for (const option of extra) {
      const role = (
        {
          mmproj: 'projector',
          'spec-draft-model': 'draft',
          'chat-template-file': 'template'
        } as const
      )[option.canonicalName as 'mmproj']
      if (role && !option.negative) {
        const path = option.values[0]
        if (!path) throw Error('Missing file path')
        const record = input.files.find((f) => f.localPath === path)
        const dep = await resolve(
          record ? managedReference(record) : { kind: 'external', path, allowUnverified: true },
          role
        )
        dependencies.push(dep)
        option.values = [dep.path]
      }
      if (
        backend === 'cpu' &&
        ((option.canonicalName === 'device' && option.values[0] !== 'none') ||
          (option.canonicalName === 'n-gpu-layers' && option.values[0] !== '0'))
      )
        throw Error('GPU arguments cannot be applied to CPU runtime')
    }
    const structured = parseExtraArgs(
      args.map((value, i) => ({ value, start: i, end: i + 1, quoted: true })),
      caps,
      'form'
    )
    const merged = mergeLaunchOptions(structured, extra, caps)
    const finalArgs = buildLaunchArguments(merged)

    report.prepared = {
      bin: runtime.bin,
      args: finalArgs,
      environmentSources,
      env: environmentSources,
      cwd: runtime.path,
      runtimeKey,
      requestKey: report.requestKey,
      dependencies,
      resolvedInput: input,
      display: formatInvocation(
        { bin: runtime.bin, args: finalArgs, cwd: runtime.path },
        variant.platform === 'windows' ? 'win32' : 'posix'
      )
    }
  } catch (e) {
    report.issues.push({
      code: 'preflight',
      severity: /Duplicate|Text-only|Unclosed|Missing value|Only startup|does not accept/.test(
        String(e)
      )
        ? 'input'
        : 'blocking',
      message: e instanceof Error ? e.message : String(e)
    })
  }
  return report
}
export const modelRoot = (configured?: string) => {
  if (configured && !isAbsolute(configured)) throw new Error('Models directory must be absolute')
  return configured ? resolve(configured) : join(global.Server.BaseDir!, 'llama-cpp', 'models')
}
