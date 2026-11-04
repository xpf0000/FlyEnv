<template>
  <div class="settings-grid"
    ><p class="settings-hint settings-section-hint settings-span-full">{{ t('speculationHint') }}</p
    ><el-form-item :label="t('speculation')"
      ><el-select :model-value="profile.speculation.mode" @change="change"
        ><el-option value="default" :label="t('defaultValue')" /><el-option
          value="none"
          :label="t('disabledValue')" /><el-option
          v-for="m in modes"
          :key="m.mode"
          :value="m.mode"
          :label="m.label"
          :disabled="!supported(m.strategy)" /></el-select
    ></el-form-item>
    <template v-if="profile.speculation.mode === 'draft'"
      ><el-form-item class="settings-span-full" :label="t('draftFile')"
        ><div class="settings-field"
          ><el-select :model-value="managedKey" clearable filterable @change="choose"
            ><el-option
              v-for="m in draftFiles"
              :key="key(m)"
              :value="key(m)"
              :label="m.path + ' · ' + m.repoId" /></el-select
          ><span v-if="profile.speculation.file.kind === 'external'" class="break-all text-xs">{{
            profile.speculation.file.path
          }}</span
          ><el-button class="settings-inline-button" :loading="picking" @click="pick">{{
            t('chooseFile')
          }}</el-button></div
        ></el-form-item
      ><el-form-item :label="t('draftThreads')"
        ><el-input-number v-model="profile.speculation.threads" :min="1" :max="512" /></el-form-item
      ><el-form-item v-if="backend !== 'cpu'" :label="t('draftGpu')"
        ><el-input-number
          :model-value="backendValues.draftGpuLayers"
          :min="0"
          :max="999"
          @update:model-value="updateBackend('draftGpuLayers', $event)" /></el-form-item
      ><el-form-item v-if="backend !== 'cpu'" :label="t('draftDevice')"
        ><el-select
          clearable
          filterable
          allow-create
          :model-value="backendValues.draftDevice"
          :placeholder="t('defaultValue')"
          @update:model-value="updateBackend('draftDevice', $event)"
          ><el-option
            v-for="d in devices"
            :key="d.name"
            :value="d.name"
            :label="d.name + ' · ' + d.description" /></el-select></el-form-item
    ></template>
    <template v-if="profile.speculation.mode === 'draft' || profile.speculation.mode === 'mtp'"
      ><el-form-item :label="t('draftMax')"
        ><el-input-number v-model="profile.speculation.maxTokens" :min="0" /></el-form-item
      ><el-form-item :label="t('draftMin')"
        ><el-input-number
          v-model="profile.speculation.minTokens"
          :min="0" /></el-form-item></template
    ><el-form-item v-if="profile.speculation.mode === 'ngram'" :label="t('ngramSize')"
      ><el-input-number v-model="profile.speculation.size" :min="1" /></el-form-item
  ></div>
</template>
<script lang="ts" setup>
  import { computed, ref, onUnmounted } from 'vue'
  import { LlamaCppManager as manager } from '../../controller'
  import { LlamaCppT as t } from '../../lang'
  import {
    modelFileKey as key,
    describeModelFile,
    managedReference
  } from '../../../shared/modelFile'
  import type { ModelProfile } from '../../../shared/settings'
  import type { RuntimeCapabilities } from '../../../shared/launchOptions'
  const profile = defineModel<ModelProfile>('profile', { required: true })
  const props = defineProps<{
    backend: string
    devices?: import('../../../shared/launchOptions').DeviceInfo[]
    caps?: RuntimeCapabilities
  }>()
  const emit = defineEmits<{ error: [message: string] }>()
  const picking = ref(false)
  let mounted = true
  const updateBackend = (field: string, value: any) => {
    const b =
      profile.value.backendOverrides[props.backend as 'cpu'] ??
      (profile.value.backendOverrides[props.backend as 'cpu'] = {})
    ;(b as any)[field] = value
  }
  const modes = [
    { mode: 'draft', strategy: 'draft-simple', label: 'Draft' },
    { mode: 'mtp', strategy: 'draft-mtp', label: 'MTP' },
    { mode: 'ngram', strategy: 'ngram-simple', label: 'Ngram' }
  ]
  const supported = (strategy: string) =>
    !!props.caps?.byAlias['--spec-type'] &&
    (!props.caps.byAlias['--spec-type'].values ||
      props.caps.byAlias['--spec-type'].values!.includes(strategy))
  const backendValues = computed(() => profile.value.backendOverrides[props.backend as 'cpu'] ?? {})
  const draftFiles = computed(() =>
    manager.localModels.filter((m) => ['main', 'draft-or-mtp'].includes(describeModelFile(m).role))
  )
  const managedKey = computed(() => {
    const s = profile.value.speculation
    return s.mode === 'draft' && s.file.kind === 'managed' ? s.file.fileKey : undefined
  })
  const change = (mode: string) => {
    profile.value.speculation =
      mode === 'draft'
        ? { mode: 'draft', file: { kind: 'external', path: '' } }
        : mode === 'mtp'
          ? { mode: 'mtp' }
          : mode === 'ngram'
            ? { mode: 'ngram' }
            : { mode: mode === 'none' ? 'none' : 'default' }
  }
  const choose = (fileKey: string) => {
    if (profile.value.speculation.mode === 'draft')
      profile.value.speculation.file = fileKey
        ? managedReference(manager.localModels.find((m) => key(m) === fileKey)!)
        : { kind: 'external', path: '' }
  }
  const pick = async () => {
    const owner = profile.value
    picking.value = true
    try {
      const file = await manager.pickReference('draft')
      if (file && mounted && owner === profile.value && profile.value.speculation.mode === 'draft')
        profile.value.speculation.file = file
    } catch (e) {
      emit('error', String(e))
    } finally {
      picking.value = false
    }
  }
  onUnmounted(() => {
    mounted = false
  })
</script>
