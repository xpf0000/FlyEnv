<template>
  <div
    ><el-form-item v-for="f in fields" :key="f.path" :label="zh ? f.zh : f.en"
      ><div class="flex w-full flex-col gap-1"
        ><div class="flex w-full items-center gap-2"
          ><el-tooltip
            :content="f.flag + (unsupported(f) ? ' · ' + t('capabilityUnknown') : '')"
            placement="top"
            ><div class="min-w-0 flex-1">
              <el-select
                v-if="f.path.endsWith('Device')"
                :model-value="
                  f.path === 'backend.gpuDevice' ? (read(f)?.split(',') ?? []) : read(f)
                "
                :multiple="f.path === 'backend.gpuDevice'"
                clearable
                filterable
                allow-create
                :disabled="disabled(f)"
                @change="change(f, $event)"
                ><el-option
                  v-for="d in devices"
                  :key="d.name"
                  :value="d.name"
                  :label="d.name + ' · ' + d.description"
              /></el-select>
              <el-select
                v-else-if="['boolean', 'enum', 'layers'].includes(f.type)"
                :model-value="read(f) ?? empty"
                class="w-full"
                filterable
                :allow-create="f.type === 'layers'"
                :disabled="disabled(f)"
                @change="change(f, $event)"
                ><el-option :value="empty" :label="t('defaultValue')" /><el-option
                  v-for="v in choices(f)"
                  :key="String(v)"
                  :value="v"
                  :label="
                    typeof v === 'boolean'
                      ? v
                        ? t('enabledValue')
                        : t('disabledValue')
                      : String(v)
                  "
              /></el-select>
              <el-input-number
                v-else-if="f.type === 'number'"
                :model-value="read(f)"
                :min="f.min"
                :max="f.max"
                :precision="f.integer ? 0 : undefined"
                :placeholder="t('defaultValue')"
                :disabled="disabled(f)"
                @update:model-value="change(f, $event)"
              />
              <el-input
                v-else
                :model-value="f.type === 'ratios' ? (read(f)?.join(',') ?? '') : read(f)"
                clearable
                :placeholder="t('defaultValue')"
                :disabled="disabled(f)"
                @update:model-value="change(f, $event)"
              /> </div></el-tooltip
          ><el-button
            v-if="read(f) !== undefined"
            size="small"
            link
            @click="change(f, undefined)"
            >{{ t('defaultValue') }}</el-button
          ></div
        ><div v-if="fromExtra(f)" class="text-xs opacity-70"
          >{{ t('sourceExtra') }}
          <el-button size="small" link @click="move(f)">{{ t('moveToForm') }}</el-button></div
        ><span v-else-if="unsupported(f)" class="text-xs opacity-60">{{
          t('capabilityUnknown')
        }}</span></div
      ></el-form-item
    ></div
  >
</template>
<script lang="ts" setup>
  import { computed } from 'vue'
  import { AppI18n } from '@lang/index'
  import { LlamaCppT as t } from '../../lang'
  import {
    settingFields,
    getSetting,
    setSetting,
    type SettingField,
    type RuntimeCapabilities
  } from '../../../shared/launchOptions'
  import {
    parseExtraArgs,
    tokenizeExtraArgs,
    canonicalOption
  } from '../../../shared/extraArguments'
  import type { ModelProfile } from '../../../shared/settings'
  const profile = defineModel<ModelProfile>('profile', { required: true })
  const props = defineProps<{
    backend: string
    caps?: RuntimeCapabilities
    devices?: import('../../../shared/launchOptions').DeviceInfo[]
    group: SettingField['group']
  }>()
  const empty = '__runtime_default__'
  const fields = computed(() => settingFields.filter((f) => f.group === props.group))
  const zh = computed(() => String(AppI18n().global.locale).startsWith('zh'))
  const extras = computed(() => {
    try {
      return props.caps
        ? parseExtraArgs(tokenizeExtraArgs(profile.value.extraArgsText), props.caps)
        : []
    } catch {
      return []
    }
  })
  const fromExtra = (f: SettingField) => {
    const cap = props.caps?.byAlias[f.flag]
    return extras.value.find(
      (o) => o.canonicalName === canonicalOption(cap?.canonicalName ?? f.flag.slice(2))
    )
  }
  const read = (f: SettingField) => getSetting(profile.value, f.path, props.backend)
  const unsupported = (f: SettingField) =>
    !!props.caps &&
    !props.caps.byAlias[f.flag] &&
    !(f.negative && props.caps.byAlias[f.negative]) &&
    !(
      f.path === 'performance.loadMode' &&
      (props.caps.byAlias['--mmap'] || props.caps.byAlias['--mlock'])
    )
  const disabled = (f: SettingField) =>
    unsupported(f) || !!fromExtra(f) || (props.backend === 'cpu' && f.path.startsWith('backend.'))
  const choices = (f: SettingField): any[] =>
    f.type === 'boolean'
      ? [true, false]
      : f.type === 'layers'
        ? [0, ...(f.values ?? []).filter((v) => props.caps?.byAlias[f.flag]?.helpLine?.includes(v))]
        : (props.caps?.byAlias[f.flag]?.values ??
          (f.path === 'performance.loadMode' && !props.caps?.byAlias[f.flag]
            ? ['mmap', 'mlock', 'mmap+mlock']
            : (f.values ?? [])))
  const change = (f: SettingField, value: any) => {
    if (f.path === 'backend.gpuDevice' && Array.isArray(value)) value = value.join(',')
    if (value === empty || value === '' || value === null) value = undefined
    if (f.type === 'layers' && typeof value === 'string' && /^\d+$/.test(value))
      value = Number(value)
    if (f.type === 'ratios' && value !== undefined) value = String(value).split(',').map(Number)
    setSetting(profile.value, f.path, props.backend, value)
  }
  const move = (f: SettingField) => {
    const o = fromExtra(f)
    if (!o) return
    const raw = profile.value.extraArgsText
    profile.value.extraArgsText = raw.slice(0, o.start) + raw.slice(o.end)
    change(
      f,
      f.type === 'boolean' ? !o.negative : f.type === 'number' ? Number(o.values[0]) : o.values[0]
    )
  }
</script>
