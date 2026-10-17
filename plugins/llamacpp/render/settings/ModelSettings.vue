<template>
  <div v-if="draft" class="flex h-full min-h-0 flex-col">
    <el-scrollbar class="min-h-0 flex-1"
      ><el-form label-width="180px" class="p-4" @submit.prevent>
        <el-form-item :label="t('selectedModel')"
          ><el-select :model-value="modelKey" class="w-full" filterable @change="chooseModel"
            ><el-option
              v-for="m in models"
              :key="key(m)"
              :label="m.path + ' · ' + m.repoId"
              :value="key(m)" /></el-select
        ></el-form-item>
        <el-button v-if="!selected" class="mb-3" @click="setServiceModel">{{
          t('setServiceModel')
        }}</el-button>
        <el-alert v-if="changedFile" :title="t('replacement')" type="warning" :closable="false"
          ><el-button @click="confirmReplacement">{{
            t('confirmReplacement')
          }}</el-button></el-alert
        >
        <el-form-item :label="t('runtime')"
          ><el-select v-model="runtimeBin" class="w-full" :placeholder="t('noRuntime')"
            ><el-option
              v-for="r in runtimes"
              :key="r.bin"
              :label="r.version + ' · ' + ((r as any).flag || 'cpu')"
              :value="r.bin" /></el-select
          ><span class="text-xs opacity-60">{{ t('checkTarget') }}</span></el-form-item
        >
        <el-divider content-position="left">{{ t('basic') }}</el-divider>
        <OptionFields
          v-model:profile="draft.value"
          :backend="backend"
          :caps="caps"
          :devices="devices"
          group="base"
        />
        <el-divider content-position="left">{{ t('projector') }}</el-divider>
        <el-form-item
          ><el-radio-group v-model="draft.value.multimodal.mode" :disabled="!!extraProjector"
            ><el-radio-button value="unset">{{ t('unset') }}</el-radio-button
            ><el-radio-button value="text">{{ t('textOnly') }}</el-radio-button
            ><el-radio-button value="projector">{{
              t('useProjector')
            }}</el-radio-button></el-radio-group
          ></el-form-item
        >
        <div v-if="extraProjector" class="mb-4 break-all text-sm"
          ><el-tag>{{ t('sourceExtra') }}</el-tag> {{ extraProjector.values[0] }}
          <el-button size="small" @click="moveProjector">{{ t('moveToForm') }}</el-button></div
        >
        <template v-if="draft.value.multimodal.mode === 'projector' && !extraProjector">
          <el-form-item :label="t('projector')"
            ><div class="flex w-full flex-col gap-2"
              ><div class="flex gap-2"
                ><el-select
                  :model-value="managedKey"
                  class="min-w-0 flex-1"
                  filterable
                  clearable
                  @change="setProjector"
                  ><el-option
                    v-for="c in candidates"
                    :key="key(c.file)"
                    :label="c.file.path + ' · ' + c.file.repoId"
                    :value="key(c.file)" /></el-select
                ><el-button :loading="picking" @click="pick">{{ t('chooseFile') }}</el-button></div
              ><span class="break-all text-xs opacity-70">{{
                externalPath || t('candidateHint')
              }}</span></div
            ></el-form-item
          >
        </template>
        <p class="mb-4 text-xs opacity-70">{{ t('projectorHint') }}</p>
        <el-button size="small" @click="$emit('openRepository', model)">{{
          t('viewRepository')
        }}</el-button>
        <OptionFields
          v-if="draft.value.multimodal.mode === 'projector' || !!extraProjector"
          v-model:profile="draft.value"
          :backend="backend"
          :caps="caps"
          :devices="devices"
          group="multimodal"
        />
        <el-collapse class="mt-5"
          ><el-collapse-item :title="t('performance')" name="performance"
            ><OptionFields
              v-model:profile="draft.value"
              :backend="backend"
              :caps="caps"
              :devices="devices"
              group="performance" /></el-collapse-item
          ><el-collapse-item :title="t('chat')" name="chat"
            ><ChatSettings
              v-model:profile="draft.value"
              :backend="backend"
              :caps="caps"
              @invalid="chatError = $event" /></el-collapse-item
          ><el-collapse-item :title="t('speculation')" name="speculation"
            ><SpeculationSettings
              v-model:profile="draft.value"
              :backend="backend"
              :caps="caps"
              :devices="devices"
              @error="error = $event" /></el-collapse-item
          ><el-collapse-item :title="t('sampling')" name="sampling"
            ><p class="mb-3 text-xs opacity-70">{{ t('samplingHint') }}</p
            ><OptionFields
              v-model:profile="draft.value"
              :backend="backend"
              :caps="caps"
              :devices="devices"
              group="sampling" /></el-collapse-item
        ></el-collapse>
        <ExtraArguments v-model="draft.value.extraArgsText" />
        <el-alert v-if="error" :title="error" type="error" :closable="false" class="mt-4" />
        <CommandPreview
          v-if="runtime"
          :input="input"
          :runtime="runtime"
          :dirty="draft.dirty"
        /> </el-form
    ></el-scrollbar>
    <div class="flex flex-wrap gap-2 border-t border-current/10 p-3">
      <el-button @click="defaults">{{ t('restoreDefaults') }}</el-button
      ><el-button :disabled="!draft.dirty" @click="reload">{{ t('discard') }}</el-button
      ><el-button type="primary" :loading="saving" @click="save().catch(() => {})">{{
        t('save')
      }}</el-button>
      <el-button
        v-if="selected && runtime && currentRuntime?.bin === runtime.bin"
        :loading="applying"
        @click="apply"
        >{{ t(currentRuntime?.run ? 'saveAndRestart' : 'saveAndStart') }}</el-button
      >
    </div>
  </div>
</template>
<script lang="ts" setup>
  import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
  import { ElMessageBox } from 'element-plus'
  import { BrewStore } from '@/store/brew'
  import { LlamaCppManager as manager } from '../controller'
  import { LlamaCppT as t } from '../lang'
  import {
    modelFileKey as key,
    isStandaloneGGUFPath,
    rankProjectors,
    managedReference
  } from '../../shared/modelFile'
  import { SettingsDraft } from './useSettingsDraft'
  import { parseExtraArgs, tokenizeExtraArgs } from '../../shared/extraArguments'
  import { clone, type LaunchInput, type ModelProfile } from '../../shared/settings'
  import { createModelProfile, fingerprint } from '../profiles'
  import type { LocalModel, RuntimeBackend } from '../../shared/types'
  import CommandPreview from './CommandPreview.vue'
  import SpeculationSettings from './sections/SpeculationSettings.vue'
  import ChatSettings from './sections/ChatSettings.vue'
  import OptionFields from './sections/OptionFields.vue'
  import ExtraArguments from './sections/ExtraArguments.vue'
  const props = defineProps<{ initialModelKey?: string; initialProjectorKey?: string }>()
  defineEmits<{ openRepository: [model: LocalModel | undefined] }>()
  const chatError = ref('')
  const draft = ref<SettingsDraft<ModelProfile>>()
  const modelKey = ref('')
  const runtimeBin = ref('')
  const saving = ref(false),
    picking = ref(false),
    error = ref('')
  let mounted = true
  const models = computed(() =>
    manager.localModels.filter((m) => m.standalone ?? isStandaloneGGUFPath(m.path, m.repoId))
  )
  const model = computed(() => models.value.find((m) => key(m) === modelKey.value))
  const currentRuntime = computed(() => BrewStore().currentVersion('llama-cpp'))
  const runtimes = computed(() => BrewStore().module('llama-cpp').installed)
  const runtime = computed(() => runtimes.value.find((r) => r.bin === runtimeBin.value))
  const backend = computed(() => {
    try {
      return (JSON.parse(runtime.value?.note ?? '{}').backend ??
        (runtime.value as any)?.flag ??
        'cpu') as RuntimeBackend
    } catch {
      return 'cpu' as RuntimeBackend
    }
  })
  const caps = computed(() =>
    manager.launch.runtimeCapabilities?.bin === runtime.value?.bin
      ? manager.launch.runtimeCapabilities?.caps
      : undefined
  )
  watch(
    runtime,
    (r) => {
      if (r) manager.launch.detectRuntime(r)
    },
    { immediate: true }
  )
  const devices = computed(() =>
    manager.launch.runtimeCapabilities?.bin === runtime.value?.bin
      ? manager.launch.runtimeCapabilities?.devices
      : []
  )
  const changedFile = computed(
    () =>
      !!model.value &&
      !!draft.value?.value.fingerprint &&
      (model.value.size !== draft.value.value.fingerprint.size ||
        model.value.sha256 !== draft.value.value.fingerprint.sha256)
  )
  const confirmReplacement = async () => {
    if (!model.value || !draft.value) return
    try {
      await ElMessageBox.confirm(
        t('replacement') + ' ' + model.value.localPath,
        t('confirmReplacement')
      )
      draft.value.value.fingerprint = fingerprint(model.value)
    } catch {}
  }
  const makeReference = (fileKey: string) =>
    managedReference(manager.localModels.find((m) => key(m) === fileKey)!)
  const setServiceModel = async () => {
    if (!model.value || !(await canLeave())) return
    try {
      if (currentRuntime.value?.run)
        await ElMessageBox.confirm(
          t('confirmSwitchModel').replace('{model}', model.value.path),
          t('switchModel')
        )
      await manager.switchModel(model.value, currentRuntime.value)
    } catch (e) {
      if (e !== 'cancel' && e !== 'close') error.value = String(e)
    }
  }
  const selected = computed(() => manager.settings?.selectedModelKey === modelKey.value)
  const applying = computed(
    () =>
      !!manager.launch.applyOperation &&
      !['success', 'partial', 'failed', 'unknown'].includes(manager.launch.applyOperation.status)
  )
  const candidates = computed(() =>
    model.value ? rankProjectors(model.value, manager.localModels) : []
  )
  const extraProjector = computed(() => {
    try {
      return caps.value && draft.value
        ? parseExtraArgs(tokenizeExtraArgs(draft.value.value.extraArgsText), caps.value).find(
            (o) => o.canonicalName === 'mmproj' && !o.negative
          )
        : undefined
    } catch {
      return undefined
    }
  })
  const moveProjector = async () => {
    const owner = draft.value,
      option = extraProjector.value
    if (!owner || !option) return
    const generation = owner.generation
    try {
      const file = manager.localModels.find((f) => f.localPath === option.values[0])
      const ref = file
        ? managedReference(file)
        : { kind: 'external' as const, path: option.values[0], allowUnverified: true }
      const checked = await manager.request<any>('inspectModelReference', ref, 'projector')
      if (owner !== draft.value) return
      owner.accept(generation, (p) => {
        p.multimodal = {
          ...p.multimodal,
          mode: 'projector',
          projector: { ...ref, fingerprint: checked.fingerprint }
        }
        p.extraArgsText = p.extraArgsText.slice(0, option.start) + p.extraArgsText.slice(option.end)
      })
    } catch (e) {
      error.value = String(e)
    }
  }
  const managedKey = computed(() => {
    const r = draft.value?.value.multimodal.projector
    return r?.kind === 'managed' ? r.fileKey : undefined
  })
  const externalPath = computed(() => {
    const r = draft.value?.value.multimodal.projector
    return r?.kind === 'external' ? r.path : undefined
  })
  const input = computed<LaunchInput>(() => ({
    ...manager.launchInput(modelKey.value),
    profile: clone(draft.value!.value)
  }))
  const reload = () => {
    const p = manager.settings.modelProfiles[modelKey.value]
    if (p) draft.value = reactive(new SettingsDraft(p))
  }
  const save = async () => {
    if (!draft.value) return
    if (chatError.value) throw Error(chatError.value)
    saving.value = true
    error.value = ''
    try {
      JSON.parse(JSON.stringify(draft.value.value))
      await manager.launch.saveModel(clone(draft.value.value))
      manager.syncProfile()
      reload()
    } catch (e) {
      error.value = String(e)
      throw e
    } finally {
      saving.value = false
    }
  }
  const canLeave = async () => {
    if (!draft.value) return true
    try {
      return await draft.value.requestLeave(async () => {
        try {
          await ElMessageBox.confirm(t('unsaved'), t('modelSettings'), {
            confirmButtonText: t('save'),
            cancelButtonText: t('discard'),
            distinguishCancelAndClose: true
          })
          return 'save'
        } catch (action) {
          return action === 'cancel' ? 'discard' : 'cancel'
        }
      }, save)
    } catch {
      return false
    }
  }
  const chooseModel = async (value: string) => {
    if (await canLeave()) {
      try {
        await manager.ensureModelProfile(value)
        modelKey.value = value
        reload()
      } catch (e) {
        error.value = String(e)
      }
    }
  }
  const setProjector = (value: string) => {
    if (!draft.value) return
    draft.value.value.multimodal.projector = value ? makeReference(value) : undefined
  }
  const pick = async () => {
    if (!draft.value) return
    const owner = draft.value,
      token = owner.generation
    picking.value = true
    try {
      const value = await manager.pickReference('projector')
      if (value && mounted && owner === draft.value) {
        if (value.description?.role === 'unknown')
          await ElMessageBox.confirm(t('sourceUnknown'), t('projector'))
        owner.accept(token, (p) => {
          p.multimodal.projector = value
        })
      }
    } catch (e) {
      if (e !== 'cancel' && e !== 'close') error.value = String(e)
    } finally {
      picking.value = false
    }
  }
  const defaults = () => {
    if (model.value && draft.value)
      draft.value.value = {
        ...createModelProfile(model.value, manager.settings.initialBase),
        revision: draft.value.value.revision,
        fingerprint: draft.value.value.fingerprint
      }
  }
  const apply = async () => {
    if (chatError.value) {
      error.value = chatError.value
      return
    }
    if (!draft.value || !runtime.value || !currentRuntime.value) return
    try {
      error.value = ''
      await manager.launch.applyModel(clone(draft.value.value), runtime.value, currentRuntime.value)
      manager.syncProfile()
      reload()
    } catch (e) {
      error.value = String(e)
    }
  }
  watch(
    () => props.initialProjectorKey,
    (v) => {
      if (v && draft.value) {
        draft.value.value.multimodal = {
          ...draft.value.value.multimodal,
          mode: 'projector',
          projector: makeReference(v)
        }
      }
    }
  )
  watch(
    () => props.initialModelKey,
    async (v) => {
      if (v && v !== modelKey.value) await chooseModel(v)
    }
  )
  onMounted(async () => {
    await manager.init()
    modelKey.value = props.initialModelKey ?? manager.settings.selectedModelKey ?? ''
    if (modelKey.value) await manager.ensureModelProfile(modelKey.value)
    runtimeBin.value = currentRuntime.value?.bin ?? runtimes.value[0]?.bin ?? ''
    reload()
    if (props.initialProjectorKey && draft.value)
      draft.value.value.multimodal = {
        ...draft.value.value.multimodal,
        mode: 'projector',
        projector: makeReference(props.initialProjectorKey)
      }
  })
  onUnmounted(() => {
    mounted = false
    if (draft.value) draft.value.generation++
  })
  defineExpose({ canLeave })
</script>
